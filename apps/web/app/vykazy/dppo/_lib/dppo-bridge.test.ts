import { describe, expect, it } from "vitest"

import type { Predvaha, UcetBalance } from "../../_lib/predvaha"
import type { OrgConfig } from "../../_lib/types"
import {
  deriveUcetniVysledek,
  splitSidlo,
  defaultSazba,
  toFigures,
  toMeta,
  missingRequired,
  type DppoForm,
} from "./dppo-bridge"

function ucet(
  synteticky: string,
  obratMD: number,
  obratDal: number,
): UcetBalance {
  return {
    ucet: synteticky,
    synteticky,
    obratMD,
    obratDal,
    ks: obratMD - obratDal,
  }
}

function predvaha(ucty: UcetBalance[]): Predvaha {
  return { ucty, sumMD: 0, sumDal: 0, balanced: true, byZdroj: {} }
}

describe("deriveUcetniVysledek", () => {
  it("zisk = výnosy − náklady (exact Kč)", () => {
    const p = predvaha([ucet("602", 0, 1_000_000), ucet("501", 600_000, 0)])
    expect(deriveUcetniVysledek(p)).toBe("400000")
  })

  it("ztráta is negative", () => {
    const p = predvaha([ucet("602", 0, 500_000), ucet("501", 800_000, 0)])
    expect(deriveUcetniVysledek(p)).toBe("-300000")
  })

  it("excludes účtová skupina 59 (daň z příjmů)", () => {
    const base = [ucet("602", 0, 1_000_000), ucet("501", 600_000, 0)]
    const withDan = predvaha([...base, ucet("591", 76_000, 0)])
    // 591 must NOT move VH před zdaněním.
    expect(deriveUcetniVysledek(withDan)).toBe("400000")
  })

  it("empty předvaha → 0", () => {
    expect(deriveUcetniVysledek(predvaha([]))).toBe("0")
  })
})

describe("splitSidlo", () => {
  it("splits ulice + č.p., dropping č.or.", () => {
    expect(splitSidlo("Nádražní 12/3")).toEqual({
      ulice: "Nádražní",
      c_pop: "12",
    })
  })
  it("plain house number", () => {
    expect(splitSidlo("Nádražní 12")).toEqual({
      ulice: "Nádražní",
      c_pop: "12",
    })
  })
  it("multi-word street", () => {
    expect(splitSidlo("Náměstí Míru 820/9")).toEqual({
      ulice: "Náměstí Míru",
      c_pop: "820",
    })
  })
  it("no number → whole to ulice, empty c_pop", () => {
    expect(splitSidlo("Bez čísla")).toEqual({ ulice: "Bez čísla", c_pop: "" })
  })
  it("empty → both empty", () => {
    expect(splitSidlo("")).toEqual({ ulice: "", c_pop: "" })
  })
})

describe("defaultSazba", () => {
  it("19 % for 2021–2023", () => {
    expect(defaultSazba("1.1.2023")).toBe("0.19")
    expect(defaultSazba("2022-01-01")).toBe("0.19")
  })
  it("21 % from 2024", () => {
    expect(defaultSazba("1.1.2024")).toBe("0.21")
    expect(defaultSazba("31.12.2025")).toBe("0.21")
  })
  it("unknown → 21 %", () => {
    expect(defaultSazba("")).toBe("0.21")
  })
})

function form(overrides: Partial<DppoForm> = {}): DppoForm {
  return {
    dic: "CZ12345679",
    cUfoCil: "451",
    cNace: "",
    typPopldpp: "1",
    zdobdOd: "1.1.2024",
    zdobdDo: "31.12.2024",
    ucetniVysledek: "400000",
    nedanoveNaklady: "",
    osvobozeneVynosy: "",
    odpocetZtraty: "",
    slevy: "",
    sazba: "0.21",
    excludeLoss: "",
    ...overrides,
  }
}

function org(overrides: Partial<OrgConfig> = {}): OrgConfig {
  return {
    nazev: "Test s.r.o.",
    ico: "12345679",
    sidlo: "Nádražní 12/3",
    psc: "110 00",
    obec: "Praha",
    stat: "Česká republika",
    pravniForma: "112",
    predmetPodnikani: "Truhlářství",
    rok: "2024",
    mesic: "12",
    keDni: "31.12.2024",
    sestavenoDne: "",
    schvalenoDne: "",
    vTisicich: true,
    ...overrides,
  }
}

describe("toFigures", () => {
  it("normalizes money inputs and passes sazba through", () => {
    const f = toFigures(form({ nedanoveNaklady: "150 000", slevy: "1000,50" }))
    expect(f.nedanove_naklady).toBe("150000")
    expect(f.slevy).toBe("1000.50")
    expect(f.sazba).toBe("0.21")
    expect(f.ucetni_vysledek).toBe("400000")
  })
  it("exclude_loss only for typ poplatníka 3", () => {
    expect(
      toFigures(form({ excludeLoss: "5000" })).exclude_loss,
    ).toBeUndefined()
    expect(
      toFigures(form({ typPopldpp: "3", excludeLoss: "5000" })).exclude_loss,
    ).toBe("5000")
  })
})

describe("toMeta", () => {
  it("maps org identity + splits sídlo, omits blank NACE", () => {
    const m = toMeta(form(), org())
    expect(m.dic).toBe("CZ12345679")
    expect(m.c_ufo_cil).toBe("451")
    expect(m.name).toBe("Test s.r.o.")
    expect(m.ulice).toBe("Nádražní")
    expect(m.c_pop).toBe("12")
    expect(m.naz_obce).toBe("Praha")
    expect(m.psc).toBe("11000")
    expect(m.c_nace).toBeUndefined()
  })
  it("includes numeric NACE when provided", () => {
    expect(toMeta(form({ cNace: "620200" }), org()).c_nace).toBe("620200")
  })
})

describe("missingRequired", () => {
  it("flags missing hard-required fields", () => {
    expect(missingRequired(form())).toEqual([])
    expect(missingRequired(form({ dic: "", cUfoCil: "" }))).toEqual([
      "DIČ",
      "Finanční úřad",
    ])
  })
})
