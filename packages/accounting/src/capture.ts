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

/** Create an účetní případ — the economic fact (§6/1). Allocates the Označení. */
export async function createEvent(
  db: RowExecutor,
  ctx: OrgCtx,
  input: EventInput,
): Promise<CapturedEvent> {
  const occurredOn = input.occurredOn
    ? sql`${input.occurredOn}::date`
    : sql`(${input.occurredAt}::timestamptz AT TIME ZONE 'Europe/Prague')::date`
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.occurredAt,
    "EVENT",
  )
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO accounting_event
          (organization_id, workspace_id, period_id, number_series_id, sequence_number, designation,
           party_id, counterparty_id, description, content, occurred_at, occurred_on, responsible_user_id)
        VALUES
          (${ctx.organizationId}::uuid, ${ctx.workspaceId}::uuid, ${input.periodId}::uuid, ${input.seriesId}::uuid,
           ${allocated.sequenceNumber}, ${allocated.designation}, ${input.partyId ?? null}, ${input.counterpartyId ?? null},
           ${input.description}, ${input.content ?? null}, ${input.occurredAt}::timestamptz, ${occurredOn}, ${input.responsibleUserId}::uuid)
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
  const isInvoice =
    input.type === "RECEIVED_INVOICE" || input.type === "ISSUED_INVOICE"
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
      if (input.type === "ISSUED_INVOICE") assertIssuedEuIsReverseCharge(p)
      partialRecordIds.push(
        await insertPartial(db, ctx, indiv.id, p, accountingCurrency),
      )
    }
    lines.push({ individualRecordId: indiv.id, partialRecordIds })
  }

  if (input.taxPointDate == null && isInvoice) {
    await db.execute(sql`
      UPDATE summary_record sr
         SET tax_point_date = dates.tax_point_date
        FROM (
          SELECT MIN(ae.occurred_on) AS tax_point_date
            FROM individual_record ir
            JOIN accounting_event ae ON ae.id = ir.accounting_event_id
           WHERE ir.summary_record_id = ${doc.id}::uuid
        ) dates
       WHERE sr.id = ${doc.id}::uuid`)
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
