// The downloadable prior-year ("minulé období") template: it must round-trip
// through the very parser the import button uses, and it must offer exactly the
// řádky the user can fill — leaves in plný rozsah, plus the aggregate calc lines
// whose detail a zkrácený rozsah hides.

import { describe, expect, it } from "vitest"

import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { minuleJsonTemplate, parseMinuleJson } from "./storage"
import { inRozsah } from "./rozsah"
import type { MinuleJson } from "./storage"

function parse(json: string): MinuleJson {
  return JSON.parse(json) as MinuleJson
}

describe("minuleJsonTemplate", () => {
  it("is accepted by parseMinuleJson with every řádek at 0", async () => {
    const json = minuleJsonTemplate("plny", "D")
    const parsed = await parseMinuleJson(
      new File([json], "vykazy-minule-sablona.json", {
        type: "application/json",
      }),
    )

    expect(parsed.kind).toBe("vykazy-minule")
    const values = [
      ...Object.values(parsed.minule.rozvahaAktiva),
      ...Object.values(parsed.minule.rozvahaPasiva),
      ...Object.values(parsed.minule.vzz),
    ]
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((v) => v === 0)).toBe(true)
  })

  it("names every řádek in the popis block", () => {
    const template = parse(minuleJsonTemplate("plny", "D"))
    const aktiva = template.minule.rozvahaAktiva
    expect(Object.keys(template.popis?.rozvahaAktiva ?? {})).toEqual(
      Object.keys(aktiva),
    )
    expect(template.popis?.rozvahaAktiva["001"]).toBeUndefined() // calc total
    expect(template.popis?.vzz["001"]).toBe(
      "I. Tržby z prodeje výrobků a služeb",
    )
  })

  it("offers only leaves in plný rozsah", () => {
    const template = parse(minuleJsonTemplate("plny", "D"))
    const aktiva = rozvahaAktiva("D")
    for (const rada of Object.keys(template.minule.rozvahaAktiva)) {
      const line = aktiva.lines.find((l) => l.rada === rada)
      expect(line?.kind).toBe("input")
    }
  })

  it("adds the aggregate calc lines a zkrácený rozsah prints", () => {
    const mikro = parse(minuleJsonTemplate("mikro", "D"))
    const pasiva = rozvahaPasiva("D")
    const radky = Object.keys(mikro.minule.rozvahaPasiva)

    // Every offered řádek is visible in the mikro rozsah...
    for (const rada of radky) {
      const line = pasiva.lines.find((l) => l.rada === rada)
      expect(line && inRozsah(pasiva.id, line, "mikro")).toBe(true)
    }
    // ...and "A. Vlastní kapitál" is offered, since its detail is hidden.
    const vlastniKapital = pasiva.lines.find((l) => l.ozn === "A.")
    expect(radky).toContain(vlastniKapital?.rada)
    // PASIVA CELKEM stays out — it is the sum of visible letters.
    const celkem = pasiva.lines.find((l) => l.ozn === "")
    expect(radky).not.toContain(celkem?.rada)
    // Fewer řádky than the plný rozsah asks for.
    expect(radky.length).toBeLessThan(
      Object.keys(parse(minuleJsonTemplate("plny", "D")).minule.rozvahaPasiva)
        .length,
    )
  })

  it("follows the selected časové-rozlišení layout", () => {
    const varD = parse(minuleJsonTemplate("plny", "D"))
    const varC = parse(minuleJsonTemplate("plny", "C"))
    const oznOf = (template: MinuleJson) =>
      Object.values(template.popis?.rozvahaAktiva ?? {})

    expect(oznOf(varD).some((p) => p.startsWith("D.1."))).toBe(true)
    expect(oznOf(varD).some((p) => p.startsWith("C.II.3."))).toBe(false)
    expect(oznOf(varC).some((p) => p.startsWith("C.II.3."))).toBe(true)
    expect(oznOf(varC).some((p) => p.startsWith("D.1."))).toBe(false)
  })

  it("covers the VZZ řádky the zkrácený rozsah prints", () => {
    const template = parse(minuleJsonTemplate("mala", "D"))
    const radky = Object.keys(template.minule.vzz)
    for (const rada of radky) {
      const line = VZZ.lines.find((l) => l.rada === rada)
      expect(line && inRozsah(VZZ.id, line, "mala")).toBe(true)
    }
    expect(radky.length).toBeGreaterThan(0)
  })
})
