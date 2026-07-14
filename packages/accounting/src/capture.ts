/**
 * Capture pipeline (UC-1 steps 1-3, shared by all regimes):
 *   accounting_event (the fact, §6/1) → summary_record (the voucher, §11) →
 *   individual_record (one line linking a case to the voucher) → partial_record
 *   (the money decomposition, §11/1c).
 *
 * "Pre-posting" stage — no posting yet (§33/5). Posting is UC-1 step 4 (see
 * posting/). Run inside a withOrganization transaction.
 *
 * Each event / voucher draws a GAPLESS Označení from its number_series and
 * freezes the formatted string (number-series.ts). The partial_record's
 * accounting-currency amounts are frozen at capture: for the single-currency
 * case they equal the source; for a foreign currency they are base × fx_rate
 * (VAT base uses vat_fx_rate when set — the §4/5 ČNB rate). All arithmetic is in
 * SQL (R13). The app_partial_period_guard trigger re-checks this coherence; the
 * settlement / revaluation halves of the FX engine live in fx/.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { allocateNumber } from "./number-series"
import { resolveCounterparty } from "./counterparty"
import { isInvoiceType } from "./types"
import type {
  CapturedDocument,
  CapturedEvent,
  CapturedLine,
  DocumentInput,
  EventInput,
  OrgCtx,
  PartialRecordInput,
} from "./types"

/** Plausible CZ VAT rates (0/12/21 from 2024; 10/15 valid pre-2024 for historical corrections). */
const PLAUSIBLE_VAT_RATES = new Set(["0", "10", "12", "15", "21"])

/**
 * Boundary sanity guard on a captured vat_rate: reject a garbage / typo rate (a
 * rate is a percentage, not a money amount, so this string check is not R13
 * arithmetic). Period-specific rate enforcement is left to the VAT-return layer.
 * Shared with the decision layer (classify.ts) so both agree on plausible rates.
 */
export function assertPlausibleVatRate(rate: string | null | undefined): void {
  if (rate == null) return
  const normalized = rate.trim().replace(/\.0+$/, "").replace(/\.$/, "")
  if (!PLAUSIBLE_VAT_RATES.has(normalized)) {
    throw new Error(
      `accounting: vat_rate "${rate}" is not a valid CZ VAT rate (0/12/21 from 2024; 10/15 pre-2024, §47 ZDPH)`,
    )
  }
}

/**
 * Boundary guard on an ISSUED intra-Community supply: an issued EU-marked supply
 * (§64 goods / §9/1 service) is a reverse-charged plnění — it MUST capture as
 * vat_mode = 'REVERSE_CHARGE' (the mode decideVat emits, classify.ts) so it
 * reaches DPH ř.20/21 + the souhrnné hlášení via the shared ISSUED_EU_SUPPLY
 * predicate, and posts through S-EU-GOODS-DELIVERY (whose vat_mode matches, or
 * expand.ts throws). A caller — including the Brain — that stamps a wrong mode
 * (e.g. EXEMPT+EU) would silently drop the supply off ř.20/21 + SH; reject it
 * here rather than reinterpret it (#541). The received side (EU acquisition §16)
 * is unaffected — this validates the ISSUED side only.
 */
function assertIssuedEuIsReverseCharge(p: PartialRecordInput): void {
  if (p.vatJurisdiction === "EU" && p.vatMode !== "REVERSE_CHARGE") {
    throw new Error(
      `accounting: an ISSUED EU supply must capture as vat_mode 'REVERSE_CHARGE' (§64/§9-1 reverse charge, osvobozeno s nárokem) — got '${p.vatMode}' (#541)`,
    )
  }
}

/**
 * Boundary guard on an ISSUED export of goods to a third country: an issued
 * §66 vývoz MUST capture as vat_mode = 'EXEMPT' (the mode decideVat emits for
 * the export side, classify.ts) so it reaches DPH ř.22 (osvobozeno s nárokem
 * na odpočet) via the dedicated export predicate, and posts through S-EXPORT
 * (whose vat_mode matches, or expand.ts throws). "IMPORT" jurisdiction marks a
 * third-country supply on EITHER side (mirrors "EU"), so a caller that stamps
 * the RECEIVED-side mode (IMPORT) on an ISSUED export would silently misfile
 * it or crash the poster; reject it here rather than reinterpret it (#566,
 * same guard shape as #541's EU sibling). The received side (§23 import) is
 * unaffected — this validates the ISSUED side only.
 */
function assertIssuedExportIsExempt(p: PartialRecordInput): void {
  if (p.vatJurisdiction === "IMPORT" && p.vatMode !== "EXEMPT") {
    throw new Error(
      `accounting: an ISSUED export to a third country must capture as vat_mode 'EXEMPT' (§66 ZDPH, osvobozeno s nárokem) — got '${p.vatMode}' (#566)`,
    )
  }
}

/**
 * Boundary guard on the SECTION_108 place-of-supply marker: §108 is a
 * self-assessment on RECEIPT (place of supply CZ, supplier not established in
 * tuzemsko → the Czech recipient přiznává daň při přijetí, DPH ř.12/13). It is
 * definitionally a received-side plnění, so it MUST NOT sit on an ISSUED
 * invoice. Rejecting it here keeps a stray SECTION_108 off the issued domestic
 * §92 PDP line (ř.25) + KH A.1 and makes the received-only invariant
 * DB-consistent (buildDph's ř.12/13 filter is RECEIVED_INVOICE only). Same guard
 * shape as the #541 (EU) / #566 (export) issued-side siblings.
 */
function assertSection108IsReceived(p: PartialRecordInput): void {
  if (p.vatJurisdiction === "SECTION_108") {
    throw new Error(
      "accounting: SECTION_108 (§108 samovyměření při přijetí) is a received-side jurisdiction — it cannot sit on an ISSUED invoice (#540)",
    )
  }
}

/**
 * Boundary guard: a §92 kód předmětu plnění (commodityCode) belongs ONLY on a
 * DOMESTIC §92 PDP row — it is meaningless on a SECTION_108 (§108 residual
 * self-assessment) row. The two land on different kontrolní hlášení sections
 * (A.1/B.1 domestic PDP vs A.2 self-assessment, kontrolni-hlaseni.ts) and only
 * A.1/B.1 has a kód field. The DB CHECK (partial_record_commodity_code_rc_chk,
 * migration 0046, tightened by 0056) is the authoritative backstop; this guard
 * gives a friendlier error at the capture boundary instead of a raw
 * constraint-violation message (#540).
 */
function assertNoCommodityCodeOnSection108(p: PartialRecordInput): void {
  if (p.vatJurisdiction === "SECTION_108" && p.commodityCode != null) {
    throw new Error(
      `accounting: a §92 kód předmětu plnění (commodityCode) cannot sit on a SECTION_108 partial — §92 domestic PDP (KH A.1/B.1) and §108 residual self-assessment (KH A.2) are different kontrolní hlášení lines — got commodityCode "${p.commodityCode}" (#540)`,
    )
  }
}

/** Create an účetní případ — the economic fact (§6/1). Allocates the Označení. */
export async function createEvent(
  db: RowExecutor,
  ctx: OrgCtx,
  input: EventInput,
): Promise<CapturedEvent> {
  const occurredAtIsDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.occurredAt)
  const occurredAt = occurredAtIsDateOnly
    ? sql`${input.occurredAt}::date::timestamp AT TIME ZONE 'Europe/Prague'`
    : sql`${input.occurredAt}::timestamptz`
  const occurredOn = input.occurredOn
    ? sql`${input.occurredOn}::date`
    : occurredAtIsDateOnly
      ? sql`${input.occurredAt}::date`
      : sql`(${input.occurredAt}::timestamptz AT TIME ZONE 'Europe/Prague')::date`
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.occurredAt,
    "EVENT",
  )
  // Explicit id wins; else resolve the partner identity (find-or-create) so the
  // derive booker can open the saldokonto obligation against the right counterparty.
  const counterpartyId =
    input.counterpartyId ??
    (input.counterparty
      ? await resolveCounterparty(db, ctx, input.counterparty)
      : null)
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO accounting_event
          (organization_id, workspace_id, period_id, number_series_id, sequence_number, designation,
           party_id, counterparty_id, description, content, occurred_at, occurred_on, responsible_user_id)
        VALUES
          (${ctx.organizationId}::uuid, ${ctx.workspaceId}::uuid, ${input.periodId}::uuid, ${input.seriesId}::uuid,
           ${allocated.sequenceNumber}, ${allocated.designation}, ${input.partyId ?? null}, ${counterpartyId},
           ${input.description}, ${input.content ?? null}, ${occurredAt}, ${occurredOn}, ${input.responsibleUserId}::uuid)
        RETURNING id`,
  )
  return {
    eventId: r.id,
    designation: allocated.designation,
    sequenceNumber: allocated.sequenceNumber,
  }
}

/**
 * Capture a document: the souhrnný účetní záznam (voucher), its individual
 * records (lines, each documenting an existing event), and each line's money
 * partial_records. Create the events first via createEvent. Returns the doklad
 * id + Označení and the created line / partial ids.
 */
export async function captureDocument(
  db: RowExecutor,
  ctx: OrgCtx,
  input: DocumentInput,
): Promise<CapturedDocument> {
  const isInvoice = isInvoiceType(input.type)
  if (input.taxPointDate != null && !isInvoice) {
    throw new Error("accounting: taxPointDate is only valid for an invoice")
  }
  if (input.receivedDate != null && input.type !== "RECEIVED_INVOICE") {
    throw new Error(
      "accounting: receivedDate is only valid for a received invoice",
    )
  }
  const accountingCurrency = await periodAccountingCurrency(db, input.periodId)
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.issuedAt,
    "DOCUMENT",
  )

  const doc = await one<{ id: string }>(
    db,
    sql`INSERT INTO summary_record
          (organization_id, workspace_id, period_id, number_series_id, sequence_number, designation,
           type, issued_at, tax_point_date, received_date, rounding_amount)
        VALUES
          (${ctx.organizationId}::uuid, ${ctx.workspaceId}::uuid, ${input.periodId}::uuid, ${input.seriesId}::uuid,
           ${allocated.sequenceNumber}, ${allocated.designation}, ${input.type}, ${input.issuedAt}::timestamptz,
           ${input.taxPointDate ?? null}::date, ${input.receivedDate ?? null}::date, ${input.roundingAmount ?? "0"})
        RETURNING id`,
  )

  const lines: CapturedLine[] = []
  for (const line of input.lines) {
    const indiv = await one<{ id: string }>(
      db,
      sql`INSERT INTO individual_record (organization_id, summary_record_id, accounting_event_id, description)
          VALUES (${ctx.organizationId}::uuid, ${doc.id}::uuid, ${line.eventId}::uuid, ${line.description ?? null})
          RETURNING id`,
    )
    const partialRecordIds: string[] = []
    for (const p of line.partials) {
      if (input.type === "ISSUED_INVOICE") {
        assertIssuedEuIsReverseCharge(p)
        assertIssuedExportIsExempt(p)
        assertSection108IsReceived(p)
      }
      assertNoCommodityCodeOnSection108(p)
      partialRecordIds.push(
        await insertPartial(db, ctx, indiv.id, p, accountingCurrency),
      )
    }
    lines.push({ individualRecordId: indiv.id, partialRecordIds })
  }

  return {
    summaryRecordId: doc.id,
    designation: allocated.designation,
    sequenceNumber: allocated.sequenceNumber,
    lines,
  }
}

/** Read the měna účetnictví pinned on the period (§4/12). */
async function periodAccountingCurrency(
  db: RowExecutor,
  periodId: string,
): Promise<string> {
  const r = await one<{ accounting_currency: string }>(
    db,
    sql`SELECT accounting_currency FROM accounting_period WHERE id = ${periodId}::uuid`,
  )
  return r.accounting_currency
}

/**
 * Insert one partial_record, freezing its accounting-currency amounts. Single
 * currency: frozen = source. Foreign currency: an fx_rate is mandatory (caught
 * here with a clear error before the DB guard), base × fx_rate, VAT base ×
 * (vat_fx_rate ?? fx_rate). A caller may override the frozen amounts (e.g. a
 * REAL booked rate) — then they pass straight through.
 */
async function insertPartial(
  db: RowExecutor,
  ctx: OrgCtx,
  individualRecordId: string,
  p: PartialRecordInput,
  accountingCurrency: string,
): Promise<string> {
  const vatAmount = p.vatAmount ?? "0"
  assertPlausibleVatRate(p.vatRate)
  const foreign = p.currencyCode !== accountingCurrency
  if (foreign && (p.fxRate === undefined || p.fxRate === null)) {
    throw new Error(
      `accounting: partial_record in ${p.currencyCode} needs an fx_rate to ${accountingCurrency} (ČNB §24 / §4-12)`,
    )
  }

  const baseInAcc =
    p.baseInAccountingCurrency !== undefined
      ? sql`${p.baseInAccountingCurrency}::numeric`
      : foreign
        ? sql`round(${p.baseAmount}::numeric * ${p.fxRate}::numeric, 4)`
        : sql`${p.baseAmount}::numeric`

  const vatInAcc =
    p.vatInAccountingCurrency !== undefined
      ? sql`${p.vatInAccountingCurrency}::numeric`
      : !foreign
        ? sql`${vatAmount}::numeric`
        : p.vatFxRate !== undefined && p.vatFxRate !== null
          ? sql`round(${vatAmount}::numeric * ${p.vatFxRate}::numeric, 4)`
          : sql`round(${vatAmount}::numeric * ${p.fxRate}::numeric, 4)`

  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO partial_record
          (organization_id, individual_record_id, quantity, measure_unit, unit_price,
           base_amount, vat_rate, vat_mode, vat_jurisdiction, supply_kind, commodity_code, vat_deductible, advance_settlement, vat_amount,
           currency_code, fx_rate_kind, fx_rate, vat_fx_rate,
           base_in_accounting_currency, vat_in_accounting_currency)
        VALUES
          (${ctx.organizationId}::uuid, ${individualRecordId}::uuid, ${p.quantity ?? null}, ${p.measureUnit ?? null}, ${p.unitPrice ?? null},
           ${p.baseAmount}, ${p.vatRate ?? null}, ${p.vatMode}, ${p.vatJurisdiction ?? null}, ${p.supplyKind ?? null}, ${p.commodityCode ?? null}, ${p.vatDeductible ?? true}, ${p.advanceSettlement ?? false}, ${vatAmount},
           ${p.currencyCode}, ${p.fxRateKind ?? null}, ${p.fxRate ?? null}, ${p.vatFxRate ?? null},
           ${baseInAcc}, ${vatInAcc})
        RETURNING id`,
  )
  return r.id
}
