import { describe, expect, it } from "vitest"

import { generateDppo } from "./write"
import { validateFiling } from "../../../validate/validate"
import { buildDppoFromAccounting, type DppoFigures } from "./adapter"
import { checkDppo } from "./checks"
import { computeDppoTotals } from "./compute"
import {
  buildPrilohaVety,
  tabulkaACelkem,
  tabulkaBCelkem,
  DPPO_TABULKA_B_RADKY,
  type DppoPriloha,
} from "./priloha"
import { DppoSchema } from "../../../model/dppo"

const meta = {
  zdobd_od: "2025-01-01",
  zdobd_do: "2025-12-31",
  c_ufo_cil: "451",
  dic: "CZ09613528",
  name: "BD Nehvizdy Henderson s.r.o.",
  kat_uj: "M",
  uc_zav: "A",
}

/** A loss-making book: the II. oddíl lands on ř.220 as a daňová ztráta. */
const figures: DppoFigures = {
  ucetni_vysledek: "-10102673",
  nedanove_naklady: "4241837",
  osvobozene_vynosy: "0",
  odpisy_danove_nad_ucetni: "389566",
  odpocet_ztraty: "0",
  slevy: "0",
  sazba: "0.21",
}

const priloha: DppoPriloha = {
  tabulkaA: [
    { uctovaSkupina: "54 - Jiné provozní náklady", castka: "899060" },
    { uctovaSkupina: "55 - Odpisy a opravné položky", castka: "3342777" },
  ],
  tabulkaB: { r3: "389566" },
  tabulkaK: { cistyObrat: "96176", pocetZamestnancu: "0", mena: "CZK" },
}

describe("tabulka A", () => {
  it("foots ř.13 as the součet of its řádky", () => {
    expect(tabulkaACelkem(priloha.tabulkaA!)).toBe("4241837")
  })

  it("emits one VetaU per řádek plus a VetaE celkem, in XSD order", () => {
    const vety = buildPrilohaVety({ tabulkaA: priloha.tabulkaA })
    expect(vety.map((v) => v.tag)).toEqual(["VetaU", "VetaU", "VetaE"])
    expect(vety[0]!.attrs).toEqual({
      naz_uc_skup: "54 - Jiné provozní náklady",
      kc_1a: "899060",
    })
    expect(vety[2]!.attrs.kc_dpp_a12).toBe("4241837")
  })

  it("caps at the twelve řádky the tiskopis prints", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      uctovaSkupina: `5${i}`,
      castka: "1",
    }))
    const vety = buildPrilohaVety({ tabulkaA: many })
    expect(vety.filter((v) => v.tag === "VetaU")).toHaveLength(12)
    // The celkem follows the rows that were actually emitted.
    expect(vety.at(-1)!.attrs.kc_dpp_a12).toBe("12")
  })
})

describe("tabulka B", () => {
  it("puts odpisová skupina 2 on ř.3, because ř.2 is neobsazeno", () => {
    const row = DPPO_TABULKA_B_RADKY.find((r) => r.radek === "r3")
    expect(row?.label).toContain("skupiny 2")
    const vety = buildPrilohaVety({ tabulkaB: { r3: "389566" } })
    expect(vety[0]!.attrs.kc_dppb2).toBe("389566")
  })

  it("maps every řádek to a distinct VetaF attribute", () => {
    const attrs = DPPO_TABULKA_B_RADKY.map((r) => r.attr)
    expect(new Set(attrs).size).toBe(attrs.length)
  })

  it("foots ř.11 celkem over ř.1 až 10", () => {
    const tabulka = { r1: "100", r3: "200", r10: "50" }
    expect(tabulkaBCelkem(tabulka)).toBe("350")
    expect(buildPrilohaVety({ tabulkaB: tabulka })[0]!.attrs.kc_dpp_b6).toBe(
      "350",
    )
  })

  it("keeps the účetní odpisy of část b) out of the ř.11 celkem", () => {
    const vety = buildPrilohaVety({ tabulkaB: { r3: "100", r12: "900" } })
    expect(vety[0]!.attrs.kc_dpp_b10).toBe("900")
    expect(vety[0]!.attrs.kc_dpp_b6).toBe("100")
  })

  it("emits no věta when the table has no věcná náplň", () => {
    expect(buildPrilohaVety({ tabulkaB: {} })).toEqual([])
  })
})

describe("tabulka K", () => {
  it("emits an explicit zero, which is a real answer for zaměstnanci", () => {
    const vety = buildPrilohaVety({
      tabulkaK: { cistyObrat: "96176", pocetZamestnancu: "0", mena: "CZK" },
    })
    expect(vety[0]).toEqual({
      tag: "VetaS",
      attrs: { kc_dpp_i1: "96176", poc_zam: "0", cisobr_mena: "CZK" },
    })
  })
})

describe("a complete return", () => {
  const model = DppoSchema.parse(
    buildDppoFromAccounting(figures, meta, priloha),
  )

  it("reports the daňová ztráta on ř.220", () => {
    // ř.200 = −10 102 673 + 4 241 837 − 389 566; ř.201 = ř.210 = 0.
    expect(computeDppoTotals(model).r220).toBe("-6250402")
    expect(model.vetaO?.kc_ii_220).toBe("-6250402")
  })

  it("carries kategorie účetní jednotky and the závěrka declaration", () => {
    expect(model.header.kat_uj).toBe("M")
    expect(model.header.uc_zav).toBe("A")
  })

  it("orders the příloha věty as the XSD sequence requires", () => {
    expect(model.extraVety.map((v) => v.tag)).toEqual([
      "VetaU",
      "VetaU",
      "VetaE",
      "VetaF",
      "VetaS",
    ])
  })

  it("raises none of the příloha warnings", () => {
    const codes = checkDppo(model).map((c) => c.code)
    expect(codes).not.toContain("kat_uj.required")
    expect(codes).not.toContain("uc_zav.required")
    expect(codes).not.toContain("tabulkaA.missing")
    expect(codes).not.toContain("tabulkaA.mismatch")
    expect(codes).not.toContain("tabulkaB.missing")
    expect(codes).not.toContain("tabulkaK.obrat")
    expect(codes).not.toContain("tabulkaK.zamestnanci")
  })

  it("validates against the vendored DPPDP9 XSD", async () => {
    const result = await validateFiling(generateDppo(model), "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })
})

describe("příloha warnings", () => {
  it("flags a ř.40 with no tabulka A behind it", () => {
    const model = DppoSchema.parse(buildDppoFromAccounting(figures, meta))
    const codes = checkDppo(model).map((c) => c.code)
    expect(codes).toContain("tabulkaA.missing")
    expect(codes).toContain("tabulkaB.missing")
    expect(codes).toContain("tabulkaK.obrat")
  })

  it("flags a tabulka A that does not foot to ř.40", () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, {
        ...priloha,
        tabulkaA: [{ uctovaSkupina: "54", castka: "1" }],
      }),
    )
    const mismatch = checkDppo(model).find(
      (c) => c.code === "tabulkaA.mismatch",
    )
    expect(mismatch?.suggestion).toBe("4241837")
  })

  it("flags a missing kategorie účetní jednotky and závěrka declaration", () => {
    const bare = { ...meta, kat_uj: undefined, uc_zav: undefined }
    const model = DppoSchema.parse(buildDppoFromAccounting(figures, bare))
    const codes = checkDppo(model).map((c) => c.code)
    expect(codes).toContain("kat_uj.required")
    expect(codes).toContain("uc_zav.required")
  })
})
