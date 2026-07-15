import { describe, expect, it } from "vitest"

import { generateDppo } from "./write"
import { readDppo } from "./read"
import { validateFiling } from "../../../validate/validate"
import type { DppoInput } from "../../../model/dppo"

const full: DppoInput = {
  header: {
    typ_dapdpp: "A",
    typ_zo: "A",
    typ_popldpp: "1",
    c_ufo_cil: "451",
    zdobd_od: "2025-01-01",
    zdobd_do: "2025-12-31",
    c_nace: "620200",
  },
  payer: {
    dic: "CZ12345678",
    zkrobchjm: "ACME s.r.o.",
    naz_obce: "Praha",
    ulice: "Testovací",
    c_pop: "1",
    psc: "11000",
  },
  vetaO: {
    kc_ii10_10: "1000000",
    kc_ii50_40: "50000",
    kc_ii120_110: "20000",
    kc_ii200_200: "1030000",
    kc_ii260_270: "1030000",
    kc_ii270_280: "21",
    kc_ii280_290: "216300",
    kc_ii_340: "216300",
    kc_ii_360: "216300",
  },
  // A příloha the model does not type field-by-field — must round-trip verbatim.
  extraVety: [
    {
      tag: "VetaR",
      attrs: { kod_sekce: "A", poradi: "1", radek: "1", t_prilohy: "Poznámka" },
    },
  ],
}

describe("readDppo", () => {
  it("round-trips generate → read → generate idempotently", () => {
    const xml1 = generateDppo(full)
    const model = readDppo(xml1)
    const xml2 = generateDppo(model)
    expect(xml2).toBe(xml1)
  })

  it("re-parses to the same typed shape (header, payer, vetaO, extraVety)", () => {
    const model = readDppo(generateDppo(full))
    expect(model.header.typ_popldpp).toBe("1")
    expect(model.header.c_nace).toBe("620200")
    expect(model.payer?.dic).toBe("12345678") // stored digits-only
    expect(model.vetaO?.kc_ii10_10).toBe("1000000")
    expect(model.extraVety).toHaveLength(1)
    expect(model.extraVety[0]?.tag).toBe("VetaR")
    expect(model.extraVety[0]?.attrs.t_prilohy).toBe("Poznámka")
  })

  it("preserves an unmodeled příloha through a full round-trip and stays XSD-valid", async () => {
    const xml = generateDppo(full)
    expect(xml).toContain("<VetaR")
    expect(xml).toContain('t_prilohy="Poznámka"')
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("throws on a document without the DPPDP9 root", () => {
    expect(() => readDppo("<Pisemnost></Pisemnost>")).toThrow(/DPPDP9/)
  })
})
