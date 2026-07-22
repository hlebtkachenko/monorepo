import { describe, expect, it } from "vitest"

import { emptyDoc, newService, newZaloha, parseDoc, serializeDoc } from "./xml"
import type { FakturaceDoc } from "./types"

function sampleDoc(): FakturaceDoc {
  const doc = emptyDoc()
  doc.supplier.nazev = "Účetní <Novák> & spol."
  doc.supplier.ico = "12345678"
  doc.customer.nazev = 'Klient "ABC" s.r.o.'
  doc.bank.cisloUctu = "123/0800"
  doc.services = [
    {
      ...newService("mesicni"),
      popis: "Vedení účetnictví",
      mnozstvi: 1,
      cena: 5000,
    },
    {
      ...newService("hodinova"),
      popis: "Konzultace",
      mnozstvi: 2.5,
      cena: 800,
    },
  ]
  doc.zalohy = [{ ...newZaloha(), cisloDokladu: "ZAL-1", castka: 1000 }]
  doc.sleva = { mode: "percent", percent: 10, fixed: 0, label: "Sleva" }
  doc.meta.cisloFaktury = "2025-06"
  doc.meta.obdobi = "Červen 2025"
  return doc
}

describe("fakturace working-file XML", () => {
  it("round-trips the whole document", () => {
    const doc = sampleDoc()
    const back = parseDoc(serializeDoc(doc))
    // ids are regenerated on parse; compare everything else.
    expect(back.supplier).toEqual(doc.supplier)
    expect(back.customer).toEqual(doc.customer)
    expect(back.bank).toEqual(doc.bank)
    expect(back.sleva).toEqual(doc.sleva)
    expect(back.meta).toEqual(doc.meta)
    const noId = <T extends { id: string }>(rows: T[]) =>
      rows.map(({ id: _id, ...rest }) => rest)
    expect(noId(back.services)).toEqual(noId(doc.services))
    expect(noId(back.zalohy)).toEqual(noId(doc.zalohy))
  })

  it("escapes XML-significant characters so they survive", () => {
    const doc = sampleDoc()
    const xml = serializeDoc(doc)
    expect(xml).toContain("&lt;Novák&gt;")
    expect(xml).toContain("&amp;")
    expect(parseDoc(xml).supplier.nazev).toBe("Účetní <Novák> & spol.")
    expect(parseDoc(xml).customer.nazev).toBe('Klient "ABC" s.r.o.')
  })

  it("throws on malformed XML", () => {
    expect(() => parseDoc("<fakturace-draft><oops")).toThrow()
  })

  it("tolerates a missing/extra nodes, coercing to safe defaults", () => {
    const doc = parseDoc(
      '<?xml version="1.0"?><fakturace-draft><supplier><nazev>X</nazev></supplier><extra>ignored</extra></fakturace-draft>',
    )
    expect(doc.supplier.nazev).toBe("X")
    expect(doc.supplier.stat).toBe("Česká republika") // default
    expect(doc.services).toEqual([])
    expect(doc.sleva.mode).toBe("none")
  })
})
