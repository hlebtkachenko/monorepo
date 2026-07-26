import { describe, expect, it } from "vitest"

import { buildDppoFromAccounting } from "./adapter"
import { generateDppo } from "./write"
import { DppoSchema } from "../../../model/dppo"
import { validateFiling } from "../../../validate/validate"
import { buildZaverkaVety, type DppoZaverka } from "./zaverka"

const empty: DppoZaverka = { aktiva: [], pasiva: [], vzz: [] }

/** c_radku EPO assigns to one of our aktiva řádky. */
const aktivaRadek = (radek: string): number =>
  Number(buildZaverkaVety({ ...empty, aktiva: [{ radek }] })[0]!.attrs.c_radku)

const pasivaRadek = (radek: string): number =>
  Number(buildZaverkaVety({ ...empty, pasiva: [{ radek }] })[0]!.attrs.c_radku)

describe("číslo řádku", () => {
  // Every anchor here was read off the EPO form (Rozvaha pro podnikatele).
  it.each([
    ["001 AKTIVA CELKEM", "001", 1],
    ["047 C.II.1.", "047", 47],
    ["067 C.II.2.4.6.", "067", 67],
    ["068 C.II.3. — parked after the D. variant", "068", 78],
    ["071 C.II.3.3.", "071", 81],
    ["072 C.III.", "072", 68],
    ["077 C.IV.2.", "077", 73],
    ["078 D.", "078", 74],
    ["081 D.3.", "081", 77],
  ])("maps aktiva %s", (_label, ours, epo) => {
    expect(aktivaRadek(ours)).toBe(epo)
  })

  it.each([
    ["001 PASIVA CELKEM", "001", 1],
    ["019 A.IV.1.", "019", 19],
    ["020 A.IV.2. — EPO leaves 20 unused", "020", 21],
    ["062 C.II.8.7.", "062", 63],
    ["063 C.III.", "063", 67],
    ["065 C.III.2.", "065", 69],
    ["066 D.", "066", 64],
    ["068 D.2.", "068", 66],
  ])("maps pasiva %s", (_label, ours, epo) => {
    expect(pasivaRadek(ours)).toBe(epo)
  })

  it("leaves the VZZ untouched — both number 1–56 over the same položky", () => {
    const vety = buildZaverkaVety({
      ...empty,
      vzz: [{ radek: "001" }, { radek: "030" }, { radek: "056" }],
    })
    expect(vety.map((v) => v.attrs.c_radku)).toEqual(["1", "30", "56"])
  })

  it("gives every one of our řádky exactly one EPO číslo, none shared", () => {
    // A gap or an overlap in the segment table would silently drop a položka
    // onto another one's řádek, which EPO rejects as a duplicate at best.
    for (const [count, map] of [
      [81, aktivaRadek],
      [68, pasivaRadek],
    ] as const) {
      const mapped = Array.from({ length: count }, (_, i) =>
        map(String(i + 1).padStart(3, "0")),
      )
      expect(new Set(mapped).size).toBe(count)
    }
  })

  it("refuses a řádek the výkaz does not have", () => {
    expect(() => aktivaRadek("082")).toThrow(/082/)
    expect(() => pasivaRadek("069")).toThrow(/069/)
    expect(() =>
      buildZaverkaVety({ ...empty, vzz: [{ radek: "057" }] }),
    ).toThrow(/057/)
  })
})

describe("buildZaverkaVety", () => {
  it("emits one věta per row, in XSD sequence order", () => {
    const vety = buildZaverkaVety({
      aktiva: [{ radek: "001", brutto: 1 }],
      pasiva: [{ radek: "001", bezne: 2 }],
      vzz: [{ radek: "001", bezne: 3 }],
    })
    expect(vety.map((v) => v.tag)).toEqual(["VetaUA", "VetaUB", "VetaUD"])
  })

  it("reports korekce without its sign", () => {
    // The books carry oprávky as a credit balance and the form prints -3 770,
    // but the XSD is explicit: "Záporné znaménko se neuvádí."
    const [veta] = buildZaverkaVety({
      ...empty,
      aktiva: [{ radek: "001", brutto: 128591, korekce: -3770, netto: 124821 }],
    })
    expect(veta!.attrs).toEqual({
      c_radku: "1",
      kc_brutto: "128591",
      kc_korekce: "3770",
      kc_netto: "124821",
    })
  })

  it("omits a column the row does not report", () => {
    // Korekce on a pohledávka prints "x" on the paper form; sending a 0 there
    // would state a figure the výkaz says does not apply.
    const [veta] = buildZaverkaVety({
      ...empty,
      aktiva: [{ radek: "047", netto: 0, nettoMinule: 0 }],
    })
    expect(veta!.attrs).toEqual({
      c_radku: "47",
      kc_netto: "0",
      kc_netto_min: "0",
    })
  })

  it("rounds to whole thousands, and never emits a negative zero", () => {
    // A haléř-level negative rounding to -0 would serialize as "-0" if it ever
    // reached the attribute as a number.
    const [veta] = buildZaverkaVety({
      ...empty,
      vzz: [{ radek: "001", bezne: 1234.6, minule: -0.4 }],
    })
    expect(veta!.attrs).toEqual({
      c_radku: "1",
      kc_sled: "1235",
      kc_min: "0",
    })
  })
})

describe("a return carrying the účetní závěrka", () => {
  const meta = {
    zdobd_od: "1.1.2025",
    zdobd_do: "31.12.2025",
    c_ufo_cil: "451",
    dic: "CZ09613528",
    uv_vyhl: "500",
    uv_mena: "CZK",
    uv_rozsah: "P",
  }
  const figures = {
    ucetni_vysledek: "-10615000",
    nedanove_naklady: "0",
    osvobozene_vynosy: "0",
    odpocet_ztraty: "0",
    sazba: "0.21",
    slevy: "0",
  }
  const zaverka: DppoZaverka = {
    aktiva: [
      { radek: "001", brutto: 128591, korekce: -3770, netto: 124821 },
      { radek: "081", netto: 49 },
    ],
    pasiva: [{ radek: "001", bezne: 124821 }, { radek: "066" }],
    vzz: [{ radek: "056", bezne: 96176 }],
  }

  it("validates against the vendored DPPDP9 XSD", async () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, zaverka),
    )
    const result = await validateFiling(generateDppo(model), "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("puts the výkazy after the daňové přílohy, in XSD sequence order", () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(
        figures,
        meta,
        { tabulkaK: { cistyObrat: "96176", pocetZamestnancu: "0" } },
        zaverka,
      ),
    )
    expect(model.extraVety.map((v) => v.tag)).toEqual([
      "VetaS",
      "VetaUA",
      "VetaUA",
      "VetaUB",
      "VetaUB",
      "VetaUD",
    ])
  })

  it("declares the výkazy in the hlavička", () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, zaverka),
    )
    expect(model.header.uv_vyhl).toBe("500")
    expect(model.header.uv_mena).toBe("CZK")
    expect(model.header.uv_rozsah).toBe("P")
  })
})
