// ISDOC 6.0.1 writer — a faithful TypeScript port of the canonical reference generator
// (~/.claude/skills/isdoc/scripts/generate.py + REFERENCE.md). Element order, per-(rate,PDP)
// aggregation, ROUND_HALF_EVEN 2-dp arithmetic, currency *Curr variant ordering, the
// cash-vs-transfer Details choice, non-VAT PartyTaxScheme omission, PDP reverse-charge, and
// the AnonymousCustomerParty (DocumentType=7) branch all reproduce the tested Python output.
// xmllint-wasm validation against the official XSD is the correctness gate (see write.test.ts).

import { randomUUID } from "node:crypto"
import Decimal from "decimal.js-light"
import { el, leaf, serialize, type XmlNode } from "../../xml/build"
import {
  IsdocInvoiceSchema,
  type IsdocInvoice,
  type IsdocParty,
} from "../../model/isdoc"

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })

const NS = "http://isdoc.cz/namespace/2013"
const CASH_METHODS = new Set([10, 20])
const TRANSFER_METHODS = new Set([31, 42, 48, 49, 50, 97])

function dec(x: string | number | null | undefined): Decimal {
  return x === null || x === undefined ? new Decimal(0) : new Decimal(x)
}

/** Round to 2 dp, banker's rounding. */
function round2(x: Decimal): Decimal {
  return x.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
}

/** Format a Decimal as a 2-dp money string. */
function money(x: Decimal): string {
  return x.toFixed(2, Decimal.ROUND_HALF_EVEN)
}

/** VAT percent — integer when whole, else its decimal form. */
function fmtPct(rate: Decimal): string {
  return rate.isInteger() ? rate.toFixed(0) : rate.toString()
}

function party(tag: string, p: IsdocParty): XmlNode {
  // These three fields have NON-empty defaults, so fall back on any falsy value
  // (incl. "") like the reference generator's `or` — an empty ICO must still emit
  // the "00000000" placeholder (REFERENCE §7), never an empty <ID/>.
  const country = el("Country", [
    leaf("IdentificationCode", p.country_code || "CZ"),
    leaf("Name", p.country_name || "Česká republika"),
  ])
  const partyChildren: XmlNode[] = [
    el("PartyIdentification", [leaf("ID", p.ico || "00000000")]),
    el("PartyName", [leaf("Name", p.name ?? "")]),
    el("PostalAddress", [
      leaf("StreetName", p.street ?? ""),
      leaf("BuildingNumber", p.building ?? ""),
      leaf("CityName", p.city ?? ""),
      leaf("PostalZone", p.zip ?? ""),
      country,
    ]),
  ]
  // Non-VAT payer → omit PartyTaxScheme (REFERENCE §6).
  if ((p.is_vat_payer ?? true) && p.dic) {
    partyChildren.push(
      el("PartyTaxScheme", [
        leaf("CompanyID", p.dic),
        leaf("TaxScheme", "VAT"),
      ]),
    )
  }
  return el(tag, [el("Party", partyChildren)])
}

function anonymousParty(a: { id: string; id_scheme: string }): XmlNode {
  return el("AnonymousCustomerParty", [
    leaf("ID", a.id),
    leaf("IDScheme", a.id_scheme ?? "UNSET"),
  ])
}

function originalRefs(
  refs: IsdocInvoice["original_references"] & object,
): XmlNode {
  const children = refs.map((r, i) => {
    const ref: XmlNode[] = [leaf("ID", r.id)]
    if (r.issue_date) ref.push(leaf("IssueDate", r.issue_date))
    if (r.uuid) ref.push(leaf("UUID", r.uuid))
    return el("OriginalDocumentReference", ref, { id: String(i + 1) })
  })
  return el("OriginalDocumentReferences", children)
}

interface RateAggregate {
  base: Decimal
  vat: Decimal
  total: Decimal
  baseCurr: Decimal
  vatCurr: Decimal
  totalCurr: Decimal
}

function emptyAggregate(): RateAggregate {
  return {
    base: new Decimal(0),
    vat: new Decimal(0),
    total: new Decimal(0),
    baseCurr: new Decimal(0),
    vatCurr: new Decimal(0),
    totalCurr: new Decimal(0),
  }
}

/** Generate an ISDOC 6.0.1 XML document from an invoice model. */
export function generateIsdoc(input: unknown): string {
  const inv = IsdocInvoiceSchema.parse(input)

  const docType = inv.doc_type
  const currency = inv.currency
  const localCcy = currency?.local ?? "CZK"
  const foreignCcy = currency?.foreign
  const hasForeign = Boolean(foreignCcy && foreignCcy !== localCcy)
  const supplierIsVat = inv.supplier.is_vat_payer ?? true

  const root: XmlNode[] = []
  root.push(leaf("DocumentType", docType))
  root.push(leaf("ID", inv.invoice_id))
  root.push(leaf("UUID", inv.uuid ?? randomUUID()))
  root.push(leaf("IssueDate", inv.issue_date))
  if (inv.tax_point_date) root.push(leaf("TaxPointDate", inv.tax_point_date))
  root.push(leaf("VATApplicable", supplierIsVat ? "true" : "false"))
  root.push(leaf("ElectronicPossibilityAgreementReference"))
  root.push(leaf("LocalCurrencyCode", localCcy))
  if (hasForeign) root.push(leaf("ForeignCurrencyCode", foreignCcy))
  // Emit rates verbatim to preserve input precision (e.g. "25.20", not "25.2").
  root.push(leaf("CurrRate", currency?.rate ?? "1"))
  root.push(leaf("RefCurrRate", currency?.ref_rate ?? "1"))

  root.push(party("AccountingSupplierParty", inv.supplier))
  if (inv.anonymous_customer && docType === "7") {
    root.push(anonymousParty(inv.anonymous_customer))
  } else {
    if (!inv.customer) {
      throw new Error(
        "filing/isdoc: customer is required (or anonymous_customer for doc_type=7)",
      )
    }
    root.push(party("AccountingCustomerParty", inv.customer))
  }

  if (inv.original_references && inv.original_references.length > 0) {
    root.push(originalRefs(inv.original_references))
  }

  // Lines + aggregation by (vat_rate, is_pdp).
  const byRate = new Map<
    string,
    { rate: Decimal; isPdp: boolean; agg: RateAggregate }
  >()
  const lineNodes: XmlNode[] = []

  inv.lines.forEach((ln, idx) => {
    const qty = dec(ln.qty)
    const upBase = dec(ln.unit_price_base)
    const rate = dec(ln.vat_rate)
    const isPdp = Boolean(ln.reverse_charge)

    const lineBase = round2(qty.times(upBase))
    const lineVat = isPdp
      ? new Decimal(0)
      : round2(lineBase.times(rate).div(100))
    const lineTotal = round2(lineBase.plus(lineVat))
    const upWithVat = isPdp
      ? upBase
      : round2(upBase.times(new Decimal(1).plus(rate.div(100))))

    let lineBaseCurr: Decimal | null = null
    let lineVatCurr: Decimal | null = null
    let lineTotalCurr: Decimal | null = null
    if (hasForeign) {
      const upBaseCurr = dec(ln.unit_price_base_curr ?? 0)
      lineBaseCurr = round2(qty.times(upBaseCurr))
      lineVatCurr = isPdp
        ? new Decimal(0)
        : round2(lineBaseCurr.times(rate).div(100))
      lineTotalCurr = round2(lineBaseCurr.plus(lineVatCurr))
    }

    const key = `${rate.toString()}|${isPdp}`
    let entry = byRate.get(key)
    if (!entry) {
      entry = { rate, isPdp, agg: emptyAggregate() }
      byRate.set(key, entry)
    }
    entry.agg.base = entry.agg.base.plus(lineBase)
    entry.agg.vat = entry.agg.vat.plus(lineVat)
    entry.agg.total = entry.agg.total.plus(lineTotal)
    if (hasForeign) {
      entry.agg.baseCurr = entry.agg.baseCurr.plus(lineBaseCurr!)
      entry.agg.vatCurr = entry.agg.vatCurr.plus(lineVatCurr!)
      entry.agg.totalCurr = entry.agg.totalCurr.plus(lineTotalCurr!)
    }

    const lineChildren: XmlNode[] = [
      leaf("ID", idx + 1),
      leaf("InvoicedQuantity", ln.qty, { unitCode: ln.unit ?? "ks" }),
    ]
    // InvoiceLine amounts: Curr BEFORE local (REFERENCE §7). UnitPrice/UnitPriceTaxInclusive
    // and LineExtensionTaxAmount have no *Curr variant.
    if (hasForeign)
      lineChildren.push(leaf("LineExtensionAmountCurr", money(lineBaseCurr!)))
    lineChildren.push(leaf("LineExtensionAmount", money(lineBase)))
    if (hasForeign) {
      lineChildren.push(
        leaf("LineExtensionAmountTaxInclusiveCurr", money(lineTotalCurr!)),
      )
    }
    lineChildren.push(leaf("LineExtensionAmountTaxInclusive", money(lineTotal)))
    lineChildren.push(leaf("LineExtensionTaxAmount", money(lineVat)))
    lineChildren.push(leaf("UnitPrice", ln.unit_price_base))
    // PDP: emit the raw base like UnitPrice (VAT self-assessed, price unchanged).
    lineChildren.push(
      leaf(
        "UnitPriceTaxInclusive",
        isPdp ? ln.unit_price_base : money(upWithVat),
      ),
    )

    const ctc: XmlNode[] = [
      leaf("Percent", fmtPct(rate)),
      leaf("VATCalculationMethod", "0"),
    ]
    if (isPdp) {
      ctc.push(
        el("LocalReverseCharge", [
          leaf("LocalReverseChargeCode", ln.reverse_charge_code ?? "4"),
        ]),
      )
    }
    lineChildren.push(el("ClassifiedTaxCategory", ctc))
    lineChildren.push(el("Item", [leaf("Description", ln.description)]))
    lineNodes.push(el("InvoiceLine", lineChildren))
  })
  root.push(el("InvoiceLines", lineNodes))

  // TaxTotal
  const already = inv.already_claimed
  // Normalize by_rate keys through Decimal so a "21.0"-spelled key still matches a
  // line rate that decimal.js-light canonicalizes to "21" (robuster than the
  // reference's fragile exact-string match).
  const alreadyByRate: Record<
    string,
    { taxable?: string; tax?: string; inclusive?: string }
  > = {}
  for (const [k, v] of Object.entries(already?.by_rate ?? {})) {
    alreadyByRate[new Decimal(k).toString()] = v
  }
  const ttChildren: XmlNode[] = []
  let grandTax = new Decimal(0)
  let grandTaxCurr = new Decimal(0)

  for (const { rate, isPdp, agg } of byRate.values()) {
    const ar = alreadyByRate[rate.toString()] ?? {}
    const alreadyTaxable = dec(ar.taxable ?? 0)
    const alreadyTax = dec(ar.tax ?? 0)
    const alreadyInc = dec(ar.inclusive ?? 0)

    const st: XmlNode[] = []
    // TaxSubTotal amounts: Curr BEFORE local (REFERENCE §7).
    if (hasForeign) st.push(leaf("TaxableAmountCurr", money(agg.baseCurr)))
    st.push(leaf("TaxableAmount", money(agg.base)))
    if (hasForeign) st.push(leaf("TaxAmountCurr", money(agg.vatCurr)))
    st.push(leaf("TaxAmount", money(agg.vat)))
    if (hasForeign)
      st.push(leaf("TaxInclusiveAmountCurr", money(agg.totalCurr)))
    st.push(leaf("TaxInclusiveAmount", money(agg.total)))
    st.push(leaf("AlreadyClaimedTaxableAmount", money(alreadyTaxable)))
    st.push(leaf("AlreadyClaimedTaxAmount", money(alreadyTax)))
    st.push(leaf("AlreadyClaimedTaxInclusiveAmount", money(alreadyInc)))
    st.push(
      leaf("DifferenceTaxableAmount", money(agg.base.minus(alreadyTaxable))),
    )
    st.push(leaf("DifferenceTaxAmount", money(agg.vat.minus(alreadyTax))))
    st.push(
      leaf("DifferenceTaxInclusiveAmount", money(agg.total.minus(alreadyInc))),
    )
    const tc: XmlNode[] = [leaf("Percent", fmtPct(rate))]
    if (isPdp) tc.push(leaf("LocalReverseChargeFlag", "true"))
    st.push(el("TaxCategory", tc))
    ttChildren.push(el("TaxSubTotal", st))

    grandTax = grandTax.plus(agg.vat)
    if (hasForeign) grandTaxCurr = grandTaxCurr.plus(agg.vatCurr)
  }
  if (hasForeign) ttChildren.push(leaf("TaxAmountCurr", money(grandTaxCurr)))
  ttChildren.push(leaf("TaxAmount", money(grandTax)))
  root.push(el("TaxTotal", ttChildren))

  // LegalMonetaryTotal: local BEFORE Curr (REFERENCE §7).
  let grandBase = new Decimal(0)
  let grandTotal = new Decimal(0)
  let grandBaseCurr = new Decimal(0)
  let grandTotalCurr = new Decimal(0)
  for (const { agg } of byRate.values()) {
    grandBase = grandBase.plus(agg.base)
    grandTotal = grandTotal.plus(agg.total)
    if (hasForeign) {
      grandBaseCurr = grandBaseCurr.plus(agg.baseCurr)
      grandTotalCurr = grandTotalCurr.plus(agg.totalCurr)
    }
  }
  const alreadyEx = dec(already?.tax_exclusive ?? 0)
  const alreadyIn = dec(already?.tax_inclusive ?? 0)
  const payable = grandTotal.minus(alreadyIn)

  const lmt: XmlNode[] = [leaf("TaxExclusiveAmount", money(grandBase))]
  if (hasForeign) lmt.push(leaf("TaxExclusiveAmountCurr", money(grandBaseCurr)))
  lmt.push(leaf("TaxInclusiveAmount", money(grandTotal)))
  if (hasForeign)
    lmt.push(leaf("TaxInclusiveAmountCurr", money(grandTotalCurr)))
  lmt.push(leaf("AlreadyClaimedTaxExclusiveAmount", money(alreadyEx)))
  lmt.push(leaf("AlreadyClaimedTaxInclusiveAmount", money(alreadyIn)))
  lmt.push(
    leaf("DifferenceTaxExclusiveAmount", money(grandBase.minus(alreadyEx))),
  )
  lmt.push(
    leaf("DifferenceTaxInclusiveAmount", money(grandTotal.minus(alreadyIn))),
  )
  lmt.push(leaf("PayableRoundingAmount", "0"))
  lmt.push(leaf("PaidDepositsAmount", "0"))
  lmt.push(leaf("PayableAmount", money(payable)))
  if (hasForeign) lmt.push(leaf("PayableAmountCurr", money(grandTotalCurr)))
  root.push(el("LegalMonetaryTotal", lmt))

  // PaymentMeans (cash vs transfer Details are an xs:choice — REFERENCE §5).
  const pmCode = inv.payment_method
  const details: XmlNode[] = []
  if (CASH_METHODS.has(pmCode)) {
    if (!inv.cash)
      throw new Error(
        "filing/isdoc: cash is required for a cash payment method",
      )
    details.push(leaf("DocumentID", inv.cash.receipt_id))
    details.push(leaf("IssueDate", inv.cash.paid_date))
  } else if (TRANSFER_METHODS.has(pmCode)) {
    if (!inv.bank)
      throw new Error(
        "filing/isdoc: bank is required for a transfer payment method",
      )
    if (!inv.due_date) {
      throw new Error(
        "filing/isdoc: due_date is required for a transfer payment method",
      )
    }
    details.push(leaf("PaymentDueDate", inv.due_date))
    details.push(leaf("ID", inv.bank.account))
    details.push(leaf("BankCode", inv.bank.code))
    details.push(leaf("Name", inv.bank.name))
    details.push(leaf("IBAN", inv.bank.iban))
    details.push(leaf("BIC", inv.bank.bic))
    if (inv.variable_symbol)
      details.push(leaf("VariableSymbol", inv.variable_symbol))
  } else {
    throw new Error(
      `filing/isdoc: unsupported payment_method ${pmCode} (see REFERENCE §4)`,
    )
  }
  root.push(
    el("PaymentMeans", [
      el("Payment", [
        leaf("PaidAmount", money(payable)),
        leaf("PaymentMeansCode", String(pmCode)),
        el("Details", details),
      ]),
    ]),
  )

  return serialize(el("Invoice", root, { version: "6.0.1", xmlns: NS }))
}
