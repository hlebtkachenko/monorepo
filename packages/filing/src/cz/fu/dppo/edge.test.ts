import { describe, it, expect } from "vitest"

import { generateDppo } from "./write"
import { readDppo } from "./read"
import { validateFiling } from "../../../validate/validate"
import type { DppoInput } from "../../../model/dppo"

const header = {
  typ_dapdpp: "A",
  typ_zo: "A",
  typ_popldpp: "1",
  c_ufo_cil: "451",
  zdobd_od: "2025-01-01",
  zdobd_do: "2025-12-31",
} as const

describe("DPPO engine edge cases", () => {
  it("XML-escapes special chars in text attributes and round-trips them exactly", async () => {
    const name = 'Tom & <b>Jerry</b> "s.r.o."'
    const xml = generateDppo({
      header,
      payer: { dic: "CZ12345678", zkrobchjm: name },
    } as DppoInput)
    // Escaped in the serialized document…
    expect(xml).toContain("&amp;")
    expect(xml).toContain("&lt;b&gt;")
    expect(xml).toContain("&quot;")
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(true)
    // …and decoded back to the original on read.
    expect(readDppo(xml).payer?.zkrobchjm).toBe(name)
  })

  it("preserves multiple occurrences of a repeatable věta in order", () => {
    const model: DppoInput = {
      header,
      vetaO: { kc_ii10_10: "1000" },
      extraVety: [
        { tag: "VetaR", attrs: { kod_sekce: "A", poradi: "1", radek: "1", t_prilohy: "one" } }, // prettier-ignore
        { tag: "VetaR", attrs: { kod_sekce: "A", poradi: "2", radek: "2", t_prilohy: "two" } }, // prettier-ignore
        { tag: "VetaR", attrs: { kod_sekce: "B", poradi: "3", radek: "3", t_prilohy: "three" } }, // prettier-ignore
      ],
    }
    const xml1 = generateDppo(model)
    expect((xml1.match(/<VetaR/g) ?? []).length).toBe(3)
    // generate → read → generate is idempotent (order + count preserved).
    expect(generateDppo(readDppo(xml1))).toBe(xml1)
  })

  it("round-trips a negative amount (daňová ztráta) and stays XSD-valid", async () => {
    const xml = generateDppo({
      header,
      vetaO: { kc_ii10_10: "-500000", kc_ii200_200: "-500000" },
    } as DppoInput)
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(true)
    expect(readDppo(xml).vetaO?.kc_ii200_200).toBe("-500000")
  })

  it("lets the XSD validator reject a decimal in a whole-koruna field", async () => {
    const xml = generateDppo({
      header,
      vetaO: { kc_ii10_10: "1000.50" },
    } as DppoInput)
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("fractionDigits")
  })

  it("lets the XSD validator reject a sazba over the 2-digit facet", async () => {
    const xml = generateDppo({
      header,
      vetaO: { kc_ii270_280: "100" },
    } as DppoInput)
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("totalDigits")
  })
})
