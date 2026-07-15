// ISDOC 6.0.1 reader — parse an ISDOC document back into the editable IsdocInvoice
// model (the inverse of write.ts). Derived/computed elements (totals, tax subtotals)
// are ignored; the writer recomputes them on export. Powers the round-trip debug page.

import Decimal from "decimal.js-light"
import { parse } from "../../xml/parse"
import type { IsdocInvoice, IsdocLine, IsdocParty } from "../../model/isdoc"

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return v !== null && typeof v === "object" ? (v as Obj) : {}
}

/** Text content of a node: a bare string, or the `#text` of an attributed node. */
function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  if (typeof v === "object" && "#text" in (v as Obj))
    return String((v as Obj)["#text"])
  return undefined
}

/** An `@_`-prefixed attribute value of a node. */
function attr(v: unknown, name: string): string | undefined {
  const a = obj(v)[`@_${name}`]
  return a === null || a === undefined ? undefined : String(a)
}

/** Normalize a fast-xml-parser child (single object or array) to an array. */
function arr(v: unknown): unknown[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function readParty(wrapper: unknown): IsdocParty | undefined {
  const party = obj(obj(wrapper).Party)
  if (Object.keys(party).length === 0) return undefined
  const addr = obj(party.PostalAddress)
  const country = obj(addr.Country)
  const pts = party.PartyTaxScheme
  return {
    ico: text(obj(party.PartyIdentification).ID),
    dic: pts ? text(obj(pts).CompanyID) : undefined,
    name: text(obj(party.PartyName).Name) ?? "",
    street: text(addr.StreetName),
    building: text(addr.BuildingNumber),
    city: text(addr.CityName),
    zip: text(addr.PostalZone),
    country_code: text(country.IdentificationCode),
    country_name: text(country.Name),
    // PartyTaxScheme present ⇔ VAT payer (write.ts emits it only for VAT payers).
    is_vat_payer: Boolean(pts),
  }
}

function readLine(node: unknown, hasForeign: boolean): IsdocLine {
  const n = obj(node)
  const qty = text(n.InvoicedQuantity) ?? "0"
  const ctc = obj(n.ClassifiedTaxCategory)
  const lrc = ctc.LocalReverseCharge
  const isPdp = lrc !== null && lrc !== undefined
  const line: IsdocLine = {
    description: text(obj(n.Item).Description) ?? "",
    qty,
    unit: attr(n.InvoicedQuantity, "unitCode") ?? "ks",
    unit_price_base: text(n.UnitPrice) ?? "0",
    vat_rate: text(ctc.Percent) ?? "0",
    reverse_charge: isPdp ? true : undefined,
    reverse_charge_code: isPdp
      ? text(obj(lrc).LocalReverseChargeCode)
      : undefined,
  }
  if (hasForeign) {
    const lineCurr = text(n.LineExtensionAmountCurr)
    if (lineCurr !== undefined && qty !== "0") {
      // No per-unit foreign price in the XML; recover it as line-foreign / qty.
      line.unit_price_base_curr = new Decimal(lineCurr)
        .div(new Decimal(qty))
        .toString()
    }
  }
  return line
}

function readPayment(
  node: unknown,
): Pick<
  IsdocInvoice,
  "payment_method" | "bank" | "cash" | "variable_symbol"
> & { due_date?: string } {
  const payment = obj(obj(node).Payment)
  const code = Number(text(payment.PaymentMeansCode) ?? "42")
  const d = obj(payment.Details)
  if (code === 10 || code === 20) {
    return {
      payment_method: code,
      cash: {
        receipt_id: text(d.DocumentID) ?? "",
        paid_date: text(d.IssueDate) ?? "",
      },
    }
  }
  return {
    payment_method: code,
    due_date: text(d.PaymentDueDate),
    bank: {
      account: text(d.ID) ?? "",
      code: text(d.BankCode) ?? "",
      name: text(d.Name) ?? "",
      iban: text(d.IBAN) ?? "",
      bic: text(d.BIC) ?? "",
    },
    variable_symbol: text(d.VariableSymbol),
  }
}

/** Parse an ISDOC 6.0.1 XML document into the editable IsdocInvoice model. */
export function readIsdoc(xml: string): IsdocInvoice {
  const inv = obj(obj(parse(xml)).Invoice)
  if (Object.keys(inv).length === 0) {
    throw new Error(
      "filing/isdoc: not an ISDOC document (no <Invoice> root element)",
    )
  }

  const foreign = text(inv.ForeignCurrencyCode)
  const hasForeign = foreign !== undefined
  const currency = hasForeign
    ? {
        local: text(inv.LocalCurrencyCode) ?? "CZK",
        foreign,
        rate: text(inv.CurrRate) ?? "1",
        ref_rate: text(inv.RefCurrRate) ?? "1",
      }
    : undefined

  const anon = inv.AnonymousCustomerParty
  const payment = readPayment(inv.PaymentMeans)

  const origRefs = arr(
    obj(inv.OriginalDocumentReferences).OriginalDocumentReference,
  ).map((r) => {
    const ro = obj(r)
    return {
      id: text(ro.ID) ?? "",
      uuid: text(ro.UUID),
      issue_date: text(ro.IssueDate),
    }
  })

  // already_claimed (advance invoices): reconstruct only when non-zero.
  const lmt = obj(inv.LegalMonetaryTotal)
  const acEx = text(lmt.AlreadyClaimedTaxExclusiveAmount)
  const acIn = text(lmt.AlreadyClaimedTaxInclusiveAmount)
  const hasAlready = Number(acEx ?? "0") !== 0 || Number(acIn ?? "0") !== 0
  const byRate: Record<
    string,
    { taxable?: string; tax?: string; inclusive?: string }
  > = {}
  for (const st of arr(obj(inv.TaxTotal).TaxSubTotal)) {
    const s = obj(st)
    const pct = text(obj(s.TaxCategory).Percent)
    if (pct === undefined) continue
    byRate[pct] = {
      taxable: text(s.AlreadyClaimedTaxableAmount),
      tax: text(s.AlreadyClaimedTaxAmount),
      inclusive: text(s.AlreadyClaimedTaxInclusiveAmount),
    }
  }

  return {
    invoice_id: text(inv.ID) ?? "",
    uuid: text(inv.UUID),
    doc_type: text(inv.DocumentType) ?? "1",
    issue_date: text(inv.IssueDate) ?? "",
    tax_point_date: text(inv.TaxPointDate),
    currency,
    supplier: readParty(inv.AccountingSupplierParty) ?? {
      name: "",
      is_vat_payer: true,
    },
    customer: anon ? undefined : readParty(inv.AccountingCustomerParty),
    anonymous_customer: anon
      ? {
          id: text(obj(anon).ID) ?? "",
          id_scheme: text(obj(anon).IDScheme) ?? "UNSET",
        }
      : undefined,
    lines: arr(obj(inv.InvoiceLines).InvoiceLine).map((l) =>
      readLine(l, hasForeign),
    ),
    payment_method: payment.payment_method,
    bank: payment.bank,
    cash: payment.cash,
    due_date: payment.due_date,
    variable_symbol: payment.variable_symbol,
    original_references: origRefs.length > 0 ? origRefs : undefined,
    already_claimed: hasAlready
      ? { tax_exclusive: acEx, tax_inclusive: acIn, by_rate: byRate }
      : undefined,
  }
}
