import { describe, expect, it } from "vitest"
import { XMLValidator } from "fast-xml-parser"

import { serializeReport } from "./report-xml"
import { emptyDoc, newService } from "./xml"
import type { FakturaceDoc } from "./types"

function reportDoc(): FakturaceDoc {
  const doc = emptyDoc()
  doc.supplier.nazev = "Dodavatel"
  doc.customer.nazev = "Odběratel"
  doc.meta.cisloFaktury = "2025-06"
  doc.meta.obdobi = "Červen 2025"
  doc.services = [
    {
      ...newService("mesicni"),
      popis: "Vedení účetnictví",
      poznamka: "42 dokladů",
      mnozstvi: 1,
      cena: 5000,
    },
  ]
  return doc
}

describe("fakturace report XML", () => {
  it("is well-formed and carries the work breakdown, metrics, filings + summary", () => {
    const doc = reportDoc()
    doc.reportMetrics = [{ id: "m", label: "Zpracované doklady", value: "42" }]
    doc.filings = [
      { id: "f", nazev: "Přehled OSSZ 06/2025", datum: "2025-07-10" },
    ]
    const xml = serializeReport(doc)
    // well-formed XML with the expected root + content.
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain("<vykaz-prace>")
    expect(xml).toContain("<popis>Vedení účetnictví</popis>")
    expect(xml).toContain("<poznamka>42 dokladů</poznamka>")
    expect(xml).toContain("<mezisoucet>5000.00</mezisoucet>")
    expect(xml).toContain("<kUhrade>5000.00</kUhrade>")
    // structured report detail (separate from billing)
    expect(xml).toContain("<popis>Zpracované doklady</popis>")
    expect(xml).toContain("<hodnota>42</hodnota>")
    expect(xml).toContain("<nazev>Přehled OSSZ 06/2025</nazev>")
  })

  it("escapes special characters", () => {
    const doc = reportDoc()
    doc.services[0]!.popis = "A & <b>"
    const xml = serializeReport(doc)
    expect(xml).toContain("A &amp; &lt;b&gt;")
  })
})
