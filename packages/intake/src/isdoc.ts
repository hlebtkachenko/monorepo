// ISDOC 6.0.1 e-invoice → Brain IR. Pure: bytes in, one Invoice record (or a fail-closed warning) out.
// Mirrors `parsePohodaDataPack` (the XML→IR precedent wired in `book`): fast-xml-parser, money as bigint
// minor units (haléř), VAT read STRAIGHT from the source aggregates — never recomputed.
//
// Why a self-contained parser and not `@workspace/filing`'s `readIsdoc`: that reader targets the round-trip
// EDIT model and deliberately DROPS the per-rate `TaxSubTotal` + `LegalMonetaryTotal` totals this booking
// path needs (its editable `IsdocInvoice` is per-line and cannot represent the per-rate aggregates). Reading
// them here keeps the VAT the SUPPLIER stamped, so the server's `vat_mismatch` veto stays an INDEPENDENT
// check (it re-derives base*rate and compares) — recomputing base*rate in the adapter would defeat it.
//
// Fail-closed is the rule (confident-wrong is the cardinal sin): an unbookable document type, an
// unresolvable direction, an already-claimed deposit, or a totals/sign inconsistency yields NO record + a
// warning, never a maybe-wrong capture. The only regime the adapter asserts is STANDARD; reverse-charge and
// zero/exempt rows route to the server's OUTSIDE_VAT hold via `vat_summary` (see `ir-to-capture`).

import { XMLParser } from "fast-xml-parser"
import type {
  Address,
  Counterparty,
  FxRate,
  Invoice,
  InvoiceDirection,
  InvoiceDocType,
  InvoiceLine,
  IrRecord,
  PaymentMethod,
  VatSummaryRow,
} from "@workspace/brain"
import { buildEnvelope } from "./provenance"
import type { ParseContext, ParseResult, ParseWarning } from "./types"
import { decodeUtf8, textOf } from "./text"
import { decimalStringToMinor } from "./tabular"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // ISDOC uses a single default namespace (no element prefixes); removeNSPrefix is a harmless no-op here but
  // guards against a namespaced variant. Internal DTD entities are not part of ISDOC — disabling them removes
  // the entity-injection surface. parseTagValue:false keeps every amount/date/code a STRING ("21", "1000.00",
  // DocumentType "1") so no leading-zero code or money value is silently coerced to a number.
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return v !== null && typeof v === "object" ? (v as Obj) : {}
}

/** Text of a node: a bare string or the `#text` of an attributed node; "" when absent. */
function text(v: unknown): string {
  return textOf(v)
}

/** An `@_`-prefixed attribute value of a node. */
function attr(v: unknown, name: string): string | undefined {
  const a = obj(v)[`@_${name}`]
  return a === null || a === undefined ? undefined : String(a)
}

/** Normalize a fast-xml-parser child (single object or array) to an array; drops null/undefined. */
function arr(v: unknown): unknown[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

/** Digits-only form (IČO / variable symbol); undefined when empty. */
function digitsOnly(value: unknown): string | undefined {
  const digits = text(value).replace(/\D/g, "")
  return digits.length > 0 ? digits : undefined
}

/** Normalized DIČ for matching: whitespace stripped, upper-cased (keeps the country prefix). */
function normalizeDic(value: string | undefined): string | undefined {
  if (!value) return undefined
  const norm = value.replace(/\s/g, "").toUpperCase()
  return norm.length > 0 ? norm : undefined
}

/**
 * A signed decimal string ("1000.00", "-42.00", "1 234,56") → bigint minor units (haléř), or null when it is
 * not a clean number. Space-thousands + comma-decimal are tolerated defensively; ISDOC itself emits a plain
 * "." decimal. The sign is preserved — callers take the magnitude and let `doc_type` own the booking sign.
 */
function toMinorSigned(value: unknown): bigint | null {
  const raw = text(value).trim()
  if (!raw) return null
  const normalized = raw.replace(/\s/g, "").replace(",", ".")
  const negative = normalized.startsWith("-")
  const unsigned = negative ? normalized.slice(1) : normalized
  return decimalStringToMinor(unsigned, false) === null
    ? null
    : (negative ? -1n : 1n) * decimalStringToMinor(unsigned, false)!
}

function toNumber(value: unknown): number | undefined {
  const raw = text(value).trim().replace(",", ".")
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) ? num : undefined
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

/**
 * ISDOC `DocumentType` code → IR `doc_type`, with the safe/bookable set gated. Codes we cannot book safely
 * (4 = zálohová faktura / proforma = a NON-tax payment request; 6 + anything unknown) are absent, so the
 * caller fails closed. `2` (dobropis / credit note) keeps a POSITIVE magnitude here and lets `invoiceToCapture`
 * flip the sign — see the double-negation guard in `parseIsdoc`.
 */
const DOC_TYPE_BY_CODE: Record<string, InvoiceDocType> = {
  "1": "invoice",
  "2": "credit_note",
  "3": "debit_note",
  "5": "advance",
  "7": "simplified",
}

/** ISDOC PaymentMeansCode → IR PaymentMethod (mirrors the writer's CASH/TRANSFER sets). */
const CASH_CODES = new Set([10, 20])
const TRANSFER_CODES = new Set([31, 42, 48, 49, 50, 97])
function paymentMethod(code: number | undefined): PaymentMethod | undefined {
  if (code === undefined) return undefined
  if (CASH_CODES.has(code)) return "cash"
  if (TRANSFER_CODES.has(code)) return "transfer"
  return "other"
}

/** Map one ISDOC `<Party>` wrapper (Accounting{Supplier,Customer}Party) to an IR Counterparty. */
function mapParty(wrapper: unknown): Counterparty | undefined {
  const party = obj(obj(wrapper).Party)
  if (Object.keys(party).length === 0) return undefined
  const name = text(obj(party.PartyName).Name) || undefined
  const ico = digitsOnly(obj(party.PartyIdentification).ID)
  const pts = party.PartyTaxScheme
  const dic = pts ? text(obj(pts).CompanyID) || undefined : undefined
  if (!name && !ico && !dic) return undefined
  const addr = obj(party.PostalAddress)
  const country = text(obj(addr.Country).IdentificationCode) || undefined
  const address: Address = {
    ...(text(addr.StreetName) ? { street: text(addr.StreetName) } : {}),
    ...(text(addr.CityName) ? { city: text(addr.CityName) } : {}),
    ...(text(addr.PostalZone) ? { zip: text(addr.PostalZone) } : {}),
    ...(country ? { country } : {}),
  }
  return {
    name: name ?? "",
    ...(ico ? { ico } : {}),
    // PartyTaxScheme present ⇔ VAT payer (the writer emits it only for VAT payers).
    ...(dic ? { dic, is_vat_payer: true } : {}),
    ...(Object.keys(address).length > 0 ? { address } : {}),
  }
}

/**
 * Direction (issued vs received) is NOT in an ISDOC document — an e-invoice is byte-identical on both sides.
 * We orient it by matching the SUBJECT org (whose books this dump is) against the two parties: subject ==
 * supplier ⇒ we issued it (FV); subject == customer ⇒ we received it (FP). IČO is the primary key, DIČ the
 * fallback. If exactly one side matches → decide; if the subject identity is absent, matches NEITHER party,
 * or matches BOTH (degenerate) → null, and the caller fails closed. A wrong guess here swaps the saldo leg
 * (311↔321) and the VAT direction — exactly the confident-wrong class, so we never default.
 */
function resolveDirection(
  supplier: Counterparty | undefined,
  customer: Counterparty | undefined,
  ctx: ParseContext,
): InvoiceDirection | null {
  const subjectIco = digitsOnly(ctx.subjectIco)
  if (subjectIco) {
    const sup = supplier?.ico === subjectIco
    const cus = customer?.ico === subjectIco
    if (sup !== cus) return sup ? "issued" : "received"
  }
  const subjectDic = normalizeDic(ctx.subjectDic)
  if (subjectDic) {
    const sup = normalizeDic(supplier?.dic) === subjectDic
    const cus = normalizeDic(customer?.dic) === subjectDic
    if (sup !== cus) return sup ? "issued" : "received"
  }
  return null
}

/** Map ISDOC InvoiceLine nodes to IR InvoiceLines (informational — the capture books off `vat_summary`). */
function mapLines(linesNode: unknown): InvoiceLine[] {
  return arr(obj(linesNode).InvoiceLine).map((node) => {
    const n = obj(node)
    const ctc = obj(n.ClassifiedTaxCategory)
    const lrc = obj(ctc.LocalReverseCharge)
    const line: InvoiceLine = {
      description: text(obj(n.Item).Description),
    }
    const quantity = toNumber(n.InvoicedQuantity)
    if (quantity !== undefined) line.quantity = quantity
    const unit = attr(n.InvoicedQuantity, "unitCode")
    if (unit) line.unit = unit
    const unitPrice = toMinorSigned(n.UnitPrice)
    if (unitPrice !== null) line.unit_price_minor = abs(unitPrice)
    const rate = toNumber(ctc.Percent)
    if (rate !== undefined) line.vat_rate = rate
    const rcCode = text(lrc.LocalReverseChargeCode)
    if (rcCode) line.reverse_charge_code = rcCode
    return line
  })
}

/** A parsed per-rate VAT subtotal, kept SIGNED for the totals/sign checks; the IR magnitudes are taken later. */
interface Subtotal {
  rate: number
  reverseCharge: boolean
  baseSigned: bigint
  taxSigned: bigint
}

/** A fail-closed parse: no record, one warning naming exactly why. */
function refuse(path: string, message: string): ParseResult {
  return { records: [], warnings: [{ path, message }] }
}

/** haléř tolerance for the Σ(base+tax) == grand-total invariant (rounding across systems, never a dropped rate). */
const TOTAL_TOLERANCE_MINOR = 5n

export function parseIsdoc(bytes: Uint8Array, ctx: ParseContext): ParseResult {
  const xml = decodeUtf8(bytes)

  let doc: Obj
  try {
    doc = parser.parse(xml) as Obj
  } catch (error) {
    return refuse(
      ctx.sourcePath,
      `isdoc xml parse failed: ${error instanceof Error ? error.message : "unknown"}`,
    )
  }

  const inv = obj(doc.Invoice)
  if (Object.keys(inv).length === 0) {
    return refuse(
      ctx.sourcePath,
      "not an ISDOC document (no <Invoice> root element)",
    )
  }

  // ── Document type gate ──────────────────────────────────────────────────────────────────────────────
  const docCode = text(inv.DocumentType) || "1"
  const docType = DOC_TYPE_BY_CODE[docCode]
  if (!docType) {
    return refuse(
      ctx.sourcePath,
      `isdoc DocumentType "${docCode}" is not an auto-bookable tax document ` +
        "(e.g. 4 = zálohová faktura / proforma is a non-tax payment request) — book it manually",
    )
  }

  // ── Deposit guard: an advance/settlement invoice with prior AlreadyClaimed amounts would double-count if
  //    booked gross. We book a first-deposit advance (no already-claimed), but fail closed once a deposit has
  //    been claimed — the settlement math is a human decision, not an auto-book. ──────────────────────────
  const lmt = obj(inv.LegalMonetaryTotal)
  const alreadyEx = toMinorSigned(lmt.AlreadyClaimedTaxExclusiveAmount) ?? 0n
  const alreadyIn = toMinorSigned(lmt.AlreadyClaimedTaxInclusiveAmount) ?? 0n
  if (alreadyEx !== 0n || alreadyIn !== 0n) {
    return refuse(
      ctx.sourcePath,
      "isdoc carries already-claimed deposit amounts (advance settlement) — booking it gross would " +
        "double-count the prior deposit; settle it against the final invoice manually",
    )
  }

  // ── Parties + direction ─────────────────────────────────────────────────────────────────────────────
  const supplier = mapParty(inv.AccountingSupplierParty)
  const customer = mapParty(inv.AccountingCustomerParty)
  const direction = resolveDirection(supplier, customer, ctx)
  if (direction === null) {
    return refuse(
      ctx.sourcePath,
      "isdoc direction is indeterminate — the subject org identity is absent, or matches neither " +
        "(or both) parties. Pass the org's IČO via `--context` `subject.ico` so issued vs received is certain",
    )
  }

  // ── Per-rate VAT subtotals (read the SUPPLIER-stamped amounts verbatim — LOCAL, never the *Curr foreign
  //    variants; keyed one row per <TaxSubTotal>, so a standard-21 and a reverse-charge-21 subtotal never
  //    collapse). ─────────────────────────────────────────────────────────────────────────────────────────
  const subtotalNodes = arr(obj(inv.TaxTotal).TaxSubTotal)
  const subtotals: Subtotal[] = []
  for (const node of subtotalNodes) {
    const n = obj(node)
    const baseSigned = toMinorSigned(n.TaxableAmount)
    const taxSigned = toMinorSigned(n.TaxAmount)
    const rate = toNumber(obj(n.TaxCategory).Percent)
    if (baseSigned === null || taxSigned === null || rate === undefined) {
      return refuse(
        ctx.sourcePath,
        "isdoc TaxSubTotal is missing a numeric TaxableAmount / TaxAmount / Percent — cannot book a " +
          "VAT breakdown from it",
      )
    }
    subtotals.push({
      rate,
      reverseCharge: text(obj(n.TaxCategory).LocalReverseChargeFlag) === "true",
      baseSigned,
      taxSigned,
    })
  }
  if (subtotals.length === 0) {
    return refuse(
      ctx.sourcePath,
      "isdoc has no TaxTotal/TaxSubTotal VAT breakdown — nothing to book",
    )
  }

  // ── Totals + the two confident-wrong guards ───────────────────────────────────────────────────────────
  const grandSigned = toMinorSigned(lmt.TaxInclusiveAmount)
  if (grandSigned === null) {
    return refuse(
      ctx.sourcePath,
      "isdoc LegalMonetaryTotal has no numeric TaxInclusiveAmount — cannot determine the document total",
    )
  }
  // Sign vs type: a dobropis (credit_note) is negative; everything else is positive. A contradiction (a
  // "credit note" with a positive total, an "invoice" with a negative one, or a zero total) is a broken /
  // ambiguous document — refuse rather than abs() it into a confidently-wrong booking.
  const expectNegative = docType === "credit_note"
  if (grandSigned === 0n || grandSigned < 0n !== expectNegative) {
    return refuse(
      ctx.sourcePath,
      `isdoc total sign (${grandSigned}) contradicts DocumentType "${docCode}" (${docType}) — refusing to ` +
        "guess the direction of the amount",
    )
  }
  // Totals invariant: Σ(base+tax) over the subtotals must equal the stated grand total (haléř tolerance). A
  // large gap means a rate was dropped or a foreign *Curr amount was read by mistake — fail closed.
  const rowsSigned = subtotals.reduce(
    (sum, s) => sum + s.baseSigned + s.taxSigned,
    0n,
  )
  if (abs(rowsSigned - grandSigned) > TOTAL_TOLERANCE_MINOR) {
    return refuse(
      ctx.sourcePath,
      `isdoc VAT breakdown (Σ ${rowsSigned}) does not reconcile with the grand total ${grandSigned} — ` +
        "refusing to book an inconsistent document",
    )
  }

  // ── Assemble the IR. Amounts are POSITIVE MAGNITUDES; `doc_type` owns the sign (a credit note's negative
  //    ISDOC amounts become a positive magnitude here, and `invoiceToCapture` flips them once — booking a
  //    negative capture. Reading them verbatim-negative would let it flip AGAIN into a positive dobropis). ─
  const vatSummary: VatSummaryRow[] = subtotals.map((s) => ({
    rate: s.rate,
    base_minor: abs(s.baseSigned),
    tax_minor: abs(s.taxSigned),
    ...(s.reverseCharge ? { reverse_charge: true } : {}),
  }))

  const localCurrency = text(inv.LocalCurrencyCode) || "CZK"
  const foreignCurrency = text(inv.ForeignCurrencyCode) || undefined
  // Book in the LOCAL (CZK) currency — every amount above was read from the non-*Curr elements, which are the
  // local amounts. The foreign currency + rate ride along as provenance; the capture path books CZK.
  let fxRate: FxRate | undefined
  if (foreignCurrency && foreignCurrency !== localCurrency) {
    const rate = toNumber(inv.CurrRate)
    const refUnits = toNumber(inv.RefCurrRate)
    if (rate !== undefined && refUnits !== undefined && refUnits !== 0) {
      fxRate = { rate, ref_units: refUnits }
    }
  }

  const payment = obj(obj(inv.PaymentMeans).Payment)
  const details = obj(payment.Details)
  const method = paymentMethod(toNumber(payment.PaymentMeansCode))
  const variableSymbol = digitsOnly(details.VariableSymbol)
  const dueDate = text(details.PaymentDueDate) || undefined
  const taxPoint = text(inv.TaxPointDate) || undefined

  // Advance (DocumentType 5) is a real tax document on a received deposit, but rarer + interacting with a
  // later settlement — flag it for the human-review pile (honest provenance; the write gate is the real hold).
  const needsReview = docType === "advance"

  const envelope = buildEnvelope({
    ctx,
    source: "isdoc",
    withinLocator: "Invoice",
    rawBytes: xml,
    raw: inv,
    confidence: needsReview ? 0.85 : 1.0,
    needsReview,
  })

  const invoice: Invoice = {
    ...envelope,
    record_type: "invoice",
    direction,
    doc_type: docType,
    number: text(inv.ID),
    issue_date: text(inv.IssueDate),
    ...(taxPoint ? { tax_point_date: taxPoint } : {}),
    ...(dueDate ? { due_date: dueDate } : {}),
    ...(supplier ? { supplier } : {}),
    ...(customer ? { customer } : {}),
    currency: localCurrency,
    ...(fxRate ? { fx_rate: fxRate } : {}),
    lines: mapLines(inv.InvoiceLines),
    vat_summary: vatSummary,
    total_minor: abs(grandSigned),
    ...(method ? { payment_method: method } : {}),
    ...(variableSymbol ? { variable_symbol: variableSymbol } : {}),
  }

  const records: IrRecord[] = [invoice]
  const warnings: ParseWarning[] = []
  return { records, warnings }
}
