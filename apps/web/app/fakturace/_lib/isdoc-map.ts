// Pure mapping FakturaceDoc → ISDOC 6.0.1 invoice input. Kept OUT of the
// "use server" file so it is unit-testable in node and can be XSD-validated
// against the real writer. Neplátce DPH: is_vat_payer=false, every line vat_rate
// "0". The whole-invoice sleva is emitted as ONE negative rate-0 line; prepaid
// zálohy use the ISDOC already_claimed mechanism (PayableAmount = total − deposits),
// so the ISDOC PayableAmount equals calc.ts's k úhradě exactly.

import type { IsdocInvoiceInput, IsdocParty } from "@workspace/filing/isdoc"

import type { FakturaceDoc, Party } from "./types"
import { kindLabel } from "./types"
import { computeTotals } from "./calc"

/** ISDOC PaymentMeansCode 42 = bezhotovostní převod. */
const PAYMENT_TRANSFER = 42

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Keep only valid ISO dates (xs:date); anything else is dropped so xmllint
 * validation never trips on a free-text date. */
function isoDate(value: string): string | undefined {
  return ISO_DATE.test(value.trim()) ? value.trim() : undefined
}

function mapParty(p: Party): IsdocParty {
  return {
    ico: p.ico || undefined,
    dic: p.dic || undefined,
    name: p.nazev,
    street: p.ulice || undefined,
    building: p.cislo || undefined,
    city: p.obec || undefined,
    zip: p.psc || undefined,
    country_code: "CZ",
    country_name: p.stat || "Česká republika",
    is_vat_payer: false,
  }
}

/** Map the document onto the ISDOC input the writer accepts. */
export function mapToIsdoc(doc: FakturaceDoc): IsdocInvoiceInput {
  const totals = computeTotals(doc)

  const lines: IsdocInvoiceInput["lines"] = doc.services.map((s) => ({
    description: s.popis || kindLabel(s.kind),
    qty: String(s.mnozstvi),
    unit: s.jednotka || "ks",
    unit_price_base: String(s.cena),
    vat_rate: "0",
  }))

  // Per-item discounts are summed into ONE negative rate-0 line (the human docs
  // show them per line; ISDOC nets to the same total). Folds into the single 0%
  // aggregate → TaxableAmount = servicesGross − Σ item discounts = servicesNet.
  if (totals.slevaTotal > 0) {
    lines.push({
      description: "Sleva",
      qty: "1",
      unit: "ks",
      unit_price_base: String(-totals.slevaTotal),
      vat_rate: "0",
    })
  }

  const input: IsdocInvoiceInput = {
    invoice_id: doc.meta.cisloFaktury || "0",
    doc_type: "1",
    issue_date: doc.meta.datumVystaveni,
    supplier: mapParty(doc.supplier),
    customer: mapParty(doc.customer),
    lines,
    payment_method: PAYMENT_TRANSFER,
    bank: {
      account: doc.bank.cisloUctu,
      code: doc.bank.kodBanky,
      name: doc.bank.nazevBanky,
      iban: doc.bank.iban,
      bic: doc.bank.bic,
    },
    currency: { local: "CZK" },
  }

  const taxPoint = isoDate(doc.meta.datumUskutecneni)
  if (taxPoint) input.tax_point_date = taxPoint
  const due = isoDate(doc.meta.datumSplatnosti)
  if (due) input.due_date = due
  if (doc.meta.variabilniSymbol) {
    input.variable_symbol = doc.meta.variabilniSymbol
  }

  // Prepaid advances → already_claimed (clamped to ≤ servicesNet in calc), so the
  // ISDOC PayableAmount = (servicesGross − discounts) − deposits.
  if (totals.zalohyApplied > 0) {
    const amount = totals.zalohyApplied.toFixed(2)
    input.already_claimed = {
      tax_exclusive: amount,
      tax_inclusive: amount,
      by_rate: { "0": { taxable: amount, tax: "0", inclusive: amount } },
    }
    // Link each advance document that has a number, so the customer's účetní can
    // reconcile the deduction against the zálohová faktura.
    const refs = doc.zalohy
      .filter((z) => z.cisloDokladu.trim() !== "")
      .map((z) => {
        const ref: { id: string; issue_date?: string } = {
          id: z.cisloDokladu.trim(),
        }
        const d = isoDate(z.datumUhrady)
        if (d) ref.issue_date = d
        return ref
      })
    if (refs.length > 0) input.original_references = refs
  }

  return input
}

/** Field-level readiness for the ISDOC export button. The writer throws on an
 * empty required field; surfacing the missing labels beats a generic failure. */
export function isdocReadiness(doc: FakturaceDoc): {
  ok: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (doc.services.length === 0) missing.push("alespoň jedna služba")
  if (!doc.meta.cisloFaktury.trim()) missing.push("číslo faktury")
  if (!isoDate(doc.meta.datumVystaveni))
    missing.push("datum vystavení (RRRR-MM-DD)")
  if (!isoDate(doc.meta.datumSplatnosti))
    missing.push("datum splatnosti (RRRR-MM-DD)")
  if (!doc.bank.cisloUctu.trim() && !doc.bank.iban.trim()) {
    missing.push("číslo účtu nebo IBAN")
  }
  if (!doc.supplier.nazev.trim()) missing.push("název dodavatele")
  if (!doc.customer.nazev.trim()) missing.push("název odběratele")
  return { ok: missing.length === 0, missing }
}
