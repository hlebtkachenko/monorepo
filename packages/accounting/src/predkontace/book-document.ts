/**
 * Whole-document booking (UC-1 step 4, derive mode). Turns ONE captured invoice
 * (a summary_record + its individual_records + partial_records) into its complete
 * double-entry posting(s) by deriving the předkontace deterministically from the
 * facts each partial already carries — no caller-supplied account lines.
 *
 * This is the production path the předkontace expander was built for. It reuses
 * the SAME decision + expansion core the held-write MD/D preview runs
 * (`classifyEvent` + `expandScenarioEntries` + the catalogue), so what the
 * reviewer sees IS what gets posted (no preview↔apply drift), and every produced
 * `posting_double_entry_line` is tagged with its source `partial_record_id`
 * (§6/2) — the invoice→ledger link left NULL by the hand-built posting path.
 *
 * One posting PER EVENT: the event (case, §6/1) is linked at the individual_record
 * level (a summary_record can bill MULTIPLE events), and `posting` references one
 * (voucher, event) pair — so an N-event invoice books N postings, each expanding
 * that event's partials. The DB asserts each posting balances (R4) at COMMIT.
 *
 * DELIBERATELY FAIL-CLOSED, never confidently-wrong: a partial whose treatment
 * cannot be decided from the persisted facts HOLDS the whole document (throws)
 * rather than book a plausible-but-wrong account:
 *   - a non-invoice voucher (no předkontace direction) — bank/cash book elsewhere;
 *   - a non-zero §37 rounding (the 548/648 leg + its sign convention is a separate
 *     accounting decision not yet pinned — booking it would guess the sign);
 *   - a null supply_kind (the cost/revenue account would default to a goods guess);
 *   - a durable-asset supply (ASSET) — capitalisation (042 vs 518) needs
 *     durable/threshold facts the partial does not persist;
 *   - a deferral (časové rozlišení) — the service-window split is not persisted;
 *   - a decision whose derived vat_mode disagrees with the stored one (inconsistent
 *     capture);
 *   - an already-booked document (idempotency: never double-book).
 * Run inside a withOrganization transaction (same tx that captured the doc, so
 * "approve a captured invoice" is one fully-landed fact).
 */

import { sql } from "drizzle-orm"
import { one, rows } from "../sql"
import type { RowExecutor } from "../sql"
import { resolveAccountIds } from "../accounts"
import { postDoubleEntry } from "../posting/double-entry"
import {
  classifyEvent,
  type Section92CommodityCode,
  type SupplyKind,
  type VatJurisdiction,
} from "../classify"
import type {
  Decimal,
  DoubleEntryLineInput,
  OrgCtx,
  PostedPosting,
} from "../types"
import { expandScenarioEntries, type PartialAmounts } from "./expand"

export interface BookDocumentInput {
  /** The summary_record (invoice voucher) to book. */
  summaryRecordId: string
  /** odpovědná osoba (R10) — the approving user id, stamped on every posting. */
  responsibleUserId: string
}

export interface BookedDocument {
  summaryRecordId: string
  /** One posting per event (individual_record) of the document. */
  postings: PostedPosting[]
}

interface DocRow {
  type: string
  period_id: string
  posting_date: string
  rounding_amount: Decimal
}

interface PartialRow {
  individual_record_id: string
  accounting_event_id: string
  partial_record_id: string
  supply_kind: SupplyKind | null
  vat_mode: string
  vat_jurisdiction: VatJurisdiction | null
  vat_rate: string | null
  commodity_code: Section92CommodityCode | null
  currency_code: string
  net: Decimal
  vat: Decimal
  gross: Decimal
  self_assessed_vat: Decimal
}

/** Absolute value of an exact decimal string (strip a leading minus; never parse to float). */
function absDecimal(d: Decimal): Decimal {
  return d.startsWith("-") ? d.slice(1) : d
}

/**
 * Book a whole captured invoice deterministically. Returns one PostedPosting per
 * event. Throws (holds the document) on any fact it cannot book safely — see the
 * module header.
 */
export async function bookDocument(
  db: RowExecutor,
  ctx: OrgCtx,
  input: BookDocumentInput,
): Promise<BookedDocument> {
  const doc = await one<DocRow>(
    db,
    sql`SELECT type,
               period_id::text                                      AS period_id,
               COALESCE(tax_point_date, issued_at::date)::text      AS posting_date,
               rounding_amount::text                                AS rounding_amount
          FROM summary_record
         WHERE id = ${input.summaryRecordId}::uuid`,
  )

  const direction =
    doc.type === "RECEIVED_INVOICE"
      ? ("RECEIVED" as const)
      : doc.type === "ISSUED_INVOICE"
        ? ("ISSUED" as const)
        : null
  if (direction === null) {
    throw new Error(
      `accounting: bookDocument books invoices (RECEIVED_INVOICE/ISSUED_INVOICE) through předkontace; summary_record ${input.summaryRecordId} is a ${doc.type} — book it via its own path`,
    )
  }

  // §37 haléřové vyrovnání → a 548/648 leg whose account+side depend on a sign
  // convention not yet pinned in the system (types.ts documents the intent, no
  // producer sets it meaningfully). Fail closed rather than guess the sign.
  if (Number(doc.rounding_amount) !== 0) {
    throw new Error(
      `accounting: summary_record ${input.summaryRecordId} has a non-zero §37 rounding (${doc.rounding_amount}); the rounding leg (548/648) is not yet booked automatically — resolve it before booking`,
    )
  }

  // Idempotency (R8): never double-book. bookDocument runs once, in the capture
  // approve tx; a second call (replayed approve) must not add a duplicate posting.
  const existing = await one<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM posting WHERE summary_record_id = ${input.summaryRecordId}::uuid`,
  )
  if (existing.n > 0) {
    throw new Error(
      `accounting: summary_record ${input.summaryRecordId} is already booked (${existing.n} posting(s)) — bookDocument is idempotent, refusing to double-book`,
    )
  }

  const partials = await rows<PartialRow>(
    db,
    // Amounts are the FROZEN účetní-měna decimals computed in SQL at capture
    // (exact, no JS float, R13); self_assessed_vat = base × rate (§37 rounding to
    // 2 dp) for the reverse-charge/import 343↔343 legs.
    sql`SELECT ir.id::text                                                        AS individual_record_id,
               ir.accounting_event_id::text                                       AS accounting_event_id,
               pr.id::text                                                        AS partial_record_id,
               pr.supply_kind                                                     AS supply_kind,
               pr.vat_mode                                                        AS vat_mode,
               pr.vat_jurisdiction                                                AS vat_jurisdiction,
               pr.vat_rate::text                                                  AS vat_rate,
               pr.commodity_code                                                  AS commodity_code,
               pr.currency_code                                                   AS currency_code,
               pr.base_in_accounting_currency::text                              AS net,
               pr.vat_in_accounting_currency::text                               AS vat,
               (pr.base_in_accounting_currency + pr.vat_in_accounting_currency)::text AS gross,
               round(pr.base_in_accounting_currency * COALESCE(pr.vat_rate, 0) / 100, 2)::text AS self_assessed_vat
          FROM individual_record ir
          JOIN partial_record pr ON pr.individual_record_id = ir.id
         WHERE ir.summary_record_id = ${input.summaryRecordId}::uuid
         ORDER BY ir.id, pr.id`,
  )
  if (partials.length === 0) {
    throw new Error(
      `accounting: summary_record ${input.summaryRecordId} has no partials to book`,
    )
  }

  // Expand each partial into account-NUMBER lines, grouped by event, collecting
  // every number so the chart is resolved in one query.
  interface EventLines {
    accountingEventId: string
    lines: {
      account: string
      side: DoubleEntryLineInput["side"]
      amount: Decimal
      partialRecordId: string
    }[]
  }
  const byEvent = new Map<string, EventLines>()
  const numbers = new Set<string>()

  for (const p of partials) {
    if (p.supply_kind === null) {
      throw new Error(
        `accounting: partial_record ${p.partial_record_id} has no supply_kind — the cost/revenue account cannot be derived; capture it before booking`,
      )
    }
    if (p.supply_kind === "ASSET") {
      throw new Error(
        `accounting: partial_record ${p.partial_record_id} is a durable ASSET — capitalisation (042 vs direct expense) depends on durable/threshold facts not persisted on the partial; book it via the asset-lifecycle path`,
      )
    }

    const isCreditNote = p.supply_kind === "CREDIT_NOTE" || Number(p.net) < 0

    const decision = classifyEvent({
      direction,
      supplyKind: p.supply_kind,
      jurisdiction: p.vat_jurisdiction ?? "DOMESTIC",
      base: absDecimal(p.net),
      vat: absDecimal(p.vat),
      vatRate: p.vat_rate,
      currency: p.currency_code,
      isCreditNote,
      commodityCode: p.commodity_code ?? undefined,
    })

    // These treatments need facts the capture does not persist — fail closed
    // rather than book a wrong account (both are unreachable from the persisted
    // facts today, so this is defensive: durable/serviceWindow are never passed).
    if (decision.capitalise) {
      throw new Error(
        `accounting: partial_record ${p.partial_record_id} classifies as a capitalised asset — not bookable from persisted facts`,
      )
    }
    if (decision.deferral) {
      throw new Error(
        `accounting: partial_record ${p.partial_record_id} classifies as a deferral (časové rozlišení) — not bookable from persisted facts`,
      )
    }
    if (decision.vatMode !== p.vat_mode) {
      throw new Error(
        `accounting: partial_record ${p.partial_record_id} stored vat_mode ${p.vat_mode} disagrees with the derived treatment (${decision.vatMode}) — inconsistent capture`,
      )
    }

    // A STANDARD dobropis posts through the reverse-SIDE template
    // (P-/S-CREDIT-NOTE-STD, which expects POSITIVE magnitudes); every other
    // scenario is posted with the SIGNED amounts as captured — a non-STANDARD
    // credit note (PDP/EU/import) keeps its jurisdiction's normal-side scenario
    // and reverses via a NEGATIVE amount (storno on the original sides, ČÚS 001).
    const useAbs = decision.scenario.endsWith("CREDIT-NOTE-STD")
    const amounts: PartialAmounts = useAbs
      ? {
          net: absDecimal(p.net),
          vat: absDecimal(p.vat),
          gross: absDecimal(p.gross),
          self_assessed_vat: absDecimal(p.self_assessed_vat),
        }
      : {
          net: p.net,
          vat: p.vat,
          gross: p.gross,
          self_assessed_vat: p.self_assessed_vat,
        }

    const scenarioLines = expandScenarioEntries(decision.scenario, amounts, {
      accountOverrides: decision.accountOverrides,
    })

    let group = byEvent.get(p.individual_record_id)
    if (!group) {
      group = { accountingEventId: p.accounting_event_id, lines: [] }
      byEvent.set(p.individual_record_id, group)
    }
    for (const l of scenarioLines) {
      numbers.add(l.account)
      group.lines.push({
        account: l.account,
        side: l.side,
        amount: l.amount,
        partialRecordId: p.partial_record_id,
      })
    }
  }

  // Resolve every account NUMBER to the period's account_id once (fails loud on a
  // number missing from the chart — §25, a missing posting account is a defect).
  const accountIds = await resolveAccountIds(db, doc.period_id, [...numbers])

  const postings: PostedPosting[] = []
  for (const group of byEvent.values()) {
    const lines: DoubleEntryLineInput[] = group.lines.map((l) => ({
      accountId: accountIds.get(l.account) as string,
      side: l.side,
      amount: l.amount,
      partialRecordId: l.partialRecordId,
    }))
    postings.push(
      await postDoubleEntry(db, ctx, {
        periodId: doc.period_id,
        summaryRecordId: input.summaryRecordId,
        accountingEventId: group.accountingEventId,
        postingDate: doc.posting_date,
        responsibleUserId: input.responsibleUserId,
        lines,
      }),
    )
  }

  return { summaryRecordId: input.summaryRecordId, postings }
}
