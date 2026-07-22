// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

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
  it("is well-formed and carries the work breakdown + summary", () => {
    const xml = serializeReport(reportDoc())
    // parses without a parsererror (round-trip through the working-file parser's
    // DOMParser is enough to confirm well-formedness here).
    const dom = new DOMParser().parseFromString(xml, "application/xml")
    expect(dom.getElementsByTagName("parsererror").length).toBe(0)
    expect(dom.documentElement.tagName).toBe("vykaz-prace")
    expect(xml).toContain("<popis>Vedení účetnictví</popis>")
    expect(xml).toContain("<poznamka>42 dokladů</poznamka>")
    expect(xml).toContain("<mezisoucet>5000.00</mezisoucet>")
    expect(xml).toContain("<kUhrade>5000.00</kUhrade>")
  })

  it("escapes special characters", () => {
    const doc = reportDoc()
    doc.services[0]!.popis = "A & <b>"
    const xml = serializeReport(doc)
    expect(xml).toContain("A &amp; &lt;b&gt;")
  })
})
