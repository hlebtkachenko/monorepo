import { describe, expect, it } from "vitest"
import { generateIsdoc } from "@workspace/filing/isdoc"
import { validateFiling } from "@workspace/filing"

import { mapToIsdoc } from "./isdoc-map"
import { computeTotals } from "./calc"
import { emptyDoc, newService, newZaloha } from "./xml"
import type { FakturaceDoc } from "./types"

function fullDoc(): FakturaceDoc {
  const doc = emptyDoc()
  doc.supplier.nazev = "Bc. Hleb Tkachenko"
  doc.supplier.ico = "12345678"
  doc.customer.nazev = "Klient s.r.o."
  doc.customer.ico = "87654321"
  doc.bank.cisloUctu = "123456789/0800"
  doc.bank.kodBanky = "0800"
  doc.bank.nazevBanky = "Česká spořitelna, a.s."
  doc.bank.iban = "CZ6508000000000123456789"
  doc.bank.bic = "GIBACZPX"
  doc.services = [
    {
      ...newService("mesicni"),
      popis: "Vedení účetnictví",
      mnozstvi: 1,
      cena: 5000,
    },
    { ...newService("hodinova"), popis: "Konzultace", mnozstvi: 2, cena: 800 },
  ]
  doc.sleva = {
    mode: "percent",
    percent: 10,
    fixed: 0,
    label: "Množstevní sleva",
  }
  doc.zalohy = [
    {
      ...newZaloha(),
      cisloDokladu: "ZAL-2025-1",
      datumUhrady: "2025-06-01",
      castka: 1000,
    },
  ]
  doc.meta.cisloFaktury = "2025-0601"
  doc.meta.variabilniSymbol = "20250601"
  doc.meta.datumVystaveni = "2025-07-01"
  doc.meta.datumUskutecneni = "2025-06-30"
  doc.meta.datumSplatnosti = "2025-07-15"
  return doc
}

describe("fakturace → ISDOC 6.0.1", () => {
  it("produces XML that validates against the official ISDOC XSD", async () => {
    const xml = generateIsdoc(mapToIsdoc(fullDoc()))
    const result = await validateFiling(xml, "isdoc", "6.0.1")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("marks the supplier as a non-VAT payer", () => {
    const xml = generateIsdoc(mapToIsdoc(fullDoc()))
    expect(xml).toContain("<VATApplicable>false</VATApplicable>")
  })

  it("PayableAmount equals calc's k úhradě (services − sleva − zálohy)", () => {
    const doc = fullDoc()
    const totals = computeTotals(doc)
    // 5000 + 1600 = 6600; −10% = 660 → 5940; −1000 záloha = 4940
    expect(totals.kUhrade).toBe(4940)
    const xml = generateIsdoc(mapToIsdoc(doc))
    expect(xml).toContain(
      `<PayableAmount>${totals.kUhrade.toFixed(2)}</PayableAmount>`,
    )
  })
})
