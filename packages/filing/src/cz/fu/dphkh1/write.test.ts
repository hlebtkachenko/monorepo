import { describe, expect, it } from "vitest"

import { generateDphkh1 } from "./write"
import { readDphkh1 } from "./read"
import { validateFiling } from "../../../validate/validate"
import { buildDphkh1FromAccounting, type KhData } from "../adapter"
import type { Dphkh1Input } from "../../../model/dphkh1"

const meta = {
  rok: "2026",
  mesic: "6",
  zdobd_od: "2026-06-01",
  zdobd_do: "2026-06-30",
  c_ufo: "451",
  dic: "CZ12345678",
  name: "ACME s.r.o.",
}

const minimal: Dphkh1Input = {
  header: { rok: "2026", mesic: "6" },
  payer: { c_ufo: "451", dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
}

const kh: KhData = {
  a1: [],
  a2: [],
  a4: [
    {
      tax_id: "CZ87654321",
      doklad: "2026-0001",
      dppd: "2026-06-15",
      kod: null,
      base21: "100000.00",
      dan21: "21000.00",
      base12: "0.00",
      dan12: "0.00",
    },
  ],
  a5: { base: "5000.00", dan: "1050.00" },
  b1: [
    {
      tax_id: "CZ11223344",
      doklad: "FP-42",
      dppd: "2026-06-20",
      kod: "4",
      base21: "30000.00",
      dan21: "6300.00",
      base12: "0.00",
      dan12: "0.00",
    },
  ],
  b2: [
    {
      tax_id: "CZ55667788",
      doklad: "FP-43",
      dppd: "2026-06-25",
      kod: null,
      base21: "80000.00",
      dan21: "16800.00",
      base12: "0.00",
      dan12: "0.00",
    },
  ],
  b3: { base: "0.00", dan: "0.00" },
}

describe("generateDphkh1", () => {
  it("emits an XSD-valid minimal control report", async () => {
    const xml = generateDphkh1(minimal)
    expect(xml).toContain('<DPHKH1 verzePis="03.01.14"')
    expect(xml).toContain('dokument="KH1"')
    const result = await validateFiling(xml, "dphkh1", "03.01.14")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("emits the row věty with haléře amounts and validates the adapter output", async () => {
    const xml = generateDphkh1(buildDphkh1FromAccounting(kh, meta))
    expect(xml).toContain("<VetaA4")
    expect(xml).toContain("<VetaB1")
    expect(xml).toContain("<VetaB2")
    expect(xml).toContain('zakl_dane1="100000.00"')
    expect(xml).toContain('dic_odb="87654321"')
    expect(xml).toContain('kod_pred_pl="4"')
    const result = await validateFiling(xml, "dphkh1", "03.01.14")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("round-trips generate → read → generate", () => {
    const xml1 = generateDphkh1(buildDphkh1FromAccounting(kh, meta))
    const xml2 = generateDphkh1(readDphkh1(xml1))
    expect(xml2).toBe(xml1)
  })

  it("reads back the row sections as arrays", () => {
    const xml = generateDphkh1(buildDphkh1FromAccounting(kh, meta))
    const model = readDphkh1(xml)
    expect(model.a4).toHaveLength(1)
    expect(model.b1).toHaveLength(1)
    expect(model.a4?.[0]?.dic_odb).toBe("87654321")
    expect(model.b1?.[0]?.kod_pred_pl).toBe("4")
  })
})
