import { describe, expect, it } from "vitest"

import type { Predvaha, UcetBalance } from "../../_lib/predvaha"
import type { OrgConfig } from "../../_lib/types"
import {
  deriveUcetniVysledek,
  deriveCistyObrat,
  splitSidlo,
  defaultSazba,
  normalizeSazba,
  applyFieldChange,
  emptyTabulkaB,
  tabulkaASoucet,
  tabulkaBSoucet,
  toFigures,
  toMeta,
  toZaverka,
  toZadost,
  toPriloha,
  missingRequired,
  type DppoFormState,
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

  it("excludes the daň z příjmů účty, including the rezerva (599)", () => {
    const base = [ucet("602", 0, 1_000_000), ucet("501", 600_000, 0)]
    // 591 splatná, 592 odložená, 595 dodatečné odvody, 599 rezerva na daň —
    // all sit below "VH před zdaněním" on the VZZ, so none may move ř.10.
    for (const dan of ["591", "592", "595", "599"]) {
      expect(
        deriveUcetniVysledek(predvaha([...base, ucet(dan, 76_000, 0)])),
      ).toBe("400000")
    }
  })

  it("excludes 596 (M. převod podílu na VH společníkům)", () => {
    const p = predvaha([
      ucet("602", 0, 1_000_000),
      ucet("501", 600_000, 0),
      ucet("596", 400_000, 0),
    ])
    // M. is reported below ř.053 Výsledek hospodaření po zdanění, not in ř.049.
    expect(deriveUcetniVysledek(p)).toBe("400000")
  })

  it("keeps the převodové účty 597/598 so they net against 697/698", () => {
    // Both sides are reported in the VZZ (F.5 / K. against III.3 / VII.), so
    // counting only the výnos side would inflate ř.10 by the transfer.
    const p = predvaha([
      ucet("602", 0, 1_000_000),
      ucet("501", 600_000, 0),
      ucet("597", 50_000, 0),
      ucet("697", 0, 50_000),
    ])
    expect(deriveUcetniVysledek(p)).toBe("400000")
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

function form(overrides: Partial<DppoFormState> = {}): DppoFormState {
  return {
    dic: "CZ12345679",
    cUfoCil: "451",
    cNace: "",
    cTelef: "",
    oprJmeno: "",
    oprPrijmeni: "",
    oprPostaveni: "",
    audit: false,
    danPor: false,
    sbirkaListin: false,
    sbirkaEmail: "",
    typPopldpp: "1",
    zdobdOd: "1.1.2024",
    zdobdDo: "31.12.2024",
    ucetniVysledek: "400000",
    nedanoveNaklady: "",
    odpisyUcetniNadDanove: "",
    osvobozeneVynosy: "",
    odpisyDanoveNadUcetni: "",
    odpocetZtraty: "",
    slevy: "",
    sazba: "0.21",
    excludeLoss: "",
    katUj: "M",
    ucZav: true,
    tabulkaA: [],
    tabulkaB: emptyTabulkaB(),
    cistyObrat: "0",
    pocetZamestnancu: "0",
    ...overrides,
  }
}

describe("deriveCistyObrat", () => {
  it("counts only skupina 60 — tržby, not the whole třída 6", () => {
    const p = predvaha([
      ucet("602", 0, 96_176),
      ucet("648", 0, 45_369),
      ucet("662", 0, 50_797),
    ])
    expect(deriveCistyObrat(p)).toBe("96176")
  })

  it("is 0 for a book whose výnosy are all ostatní a finanční", () => {
    const p = predvaha([
      ucet("648", 0, 45_369),
      ucet("662", 0, 50_797),
      ucet("663", 0, 10),
    ])
    expect(deriveCistyObrat(p)).toBe("0")
  })
})

describe("toPriloha", () => {
  it("always emits tabulka K, including an explicit zero", () => {
    const priloha = toPriloha(form({ cistyObrat: "0", pocetZamestnancu: "0" }))
    expect(priloha.tabulkaK).toEqual({
      cistyObrat: "0",
      pocetZamestnancu: "0",
      mena: "CZK",
    })
  })

  it("omits the měna before 2024, where EPO forbids it", () => {
    const priloha = toPriloha(form({ zdobdOd: "1.1.2023" }))
    expect(priloha.tabulkaK?.mena).toBeUndefined()
  })

  it("drops blank tabulka A řádky and omits an empty tabulka B", () => {
    const priloha = toPriloha(
      form({
        tabulkaA: [
          { uctovaSkupina: "54", castka: "1 000" },
          { uctovaSkupina: "", castka: "" },
        ],
      }),
    )
    expect(priloha.tabulkaA).toEqual([{ uctovaSkupina: "54", castka: "1000" }])
    expect(priloha.tabulkaB).toBeUndefined()
  })

  it("keeps only the non-zero tabulka B řádky", () => {
    const priloha = toPriloha(
      form({ tabulkaB: { ...emptyTabulkaB(), r3: "389566" } }),
    )
    expect(priloha.tabulkaB).toEqual({ r3: "389566" })
  })
})

describe("tabulka součty", () => {
  it("foots tabulka A over its řádky", () => {
    expect(
      tabulkaASoucet([
        { uctovaSkupina: "54", castka: "899 060" },
        { uctovaSkupina: "55", castka: "3342777" },
      ]),
    ).toBe(4241837)
  })

  it("foots tabulka B over ř.1 až 10, excluding the účetní odpisy of ř.12", () => {
    expect(
      tabulkaBSoucet({ ...emptyTabulkaB(), r3: "389566", r12: "1000" }),
    ).toBe(389566)
  })
})

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
  it("maps the odpisy differences (ř.50 / ř.150) when non-zero, drops zero", () => {
    const f = toFigures(
      form({ odpisyUcetniNadDanove: "30000", odpisyDanoveNadUcetni: "0" }),
    )
    expect(f.odpisy_ucetni_nad_danove).toBe("30000")
    expect(f.odpisy_danove_nad_ucetni).toBeUndefined()
  })
})

describe("toMeta", () => {
  it("maps org identity + splits sídlo, omits blank NACE", () => {
    const m = toMeta(form(), org(), "plny")
    expect(m.dic).toBe("CZ12345679")
    expect(m.c_ufo_cil).toBe("451")
    expect(m.name).toBe("Test s.r.o.")
    expect(m.ulice).toBe("Nádražní")
    expect(m.c_pop).toBe("12")
    expect(m.naz_obce).toBe("Praha")
    expect(m.psc).toBe("11000")
    expect(m.c_nace).toBeUndefined()
  })
  it("declares the výkazy: vyhláška, měna, and one rozsah when both share it", () => {
    const m = toMeta(form(), org(), "plny")
    expect(m.uv_vyhl).toBe("500")
    expect(m.uv_mena).toBe("CZK")
    expect(m.uv_rozsah).toBe("P")
    expect(m.uv_rozsah_rozv).toBeUndefined()
  })
  it("splits the rozsah when the rozvaha and the VZZ differ", () => {
    // § 3a odst. 4 gives the VZZ one zkrácený tvar, so a mikro ÚJ files the
    // rozvaha as M and the VZZ as Z — EPO wants both stated.
    const m = toMeta(form(), org(), "mikro")
    expect(m.uv_rozsah).toBeUndefined()
    expect(m.uv_rozsah_rozv).toBe("M")
    expect(m.uv_rozsah_vzz).toBe("Z")
  })
  it("includes numeric NACE when provided", () => {
    expect(toMeta(form({ cNace: "620200" }), org(), "plny").c_nace).toBe(
      "620200",
    )
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

describe("normalizeSazba", () => {
  it("passes a fraction through", () => {
    expect(normalizeSazba("0.21")).toBe("0.21")
    expect(normalizeSazba("0,19")).toBe("0.19")
  })
  it("treats a whole percent (≥ 1) as a fraction", () => {
    expect(normalizeSazba("21")).toBe("0.21")
    expect(normalizeSazba("19")).toBe("0.19")
  })
  it("blank / non-numeric → 21 %", () => {
    expect(normalizeSazba("")).toBe("0.21")
    expect(normalizeSazba("abc")).toBe("0.21")
  })
})

describe("applyFieldChange", () => {
  it("re-derives sazba when the zdaňovací období changes", () => {
    const f2023 = applyFieldChange(
      form({ sazba: "0.21" }),
      "zdobdOd",
      "1.1.2023",
    )
    expect(f2023.sazba).toBe("0.19")
    const f2024 = applyFieldChange(f2023, "zdobdOd", "1.1.2024")
    expect(f2024.sazba).toBe("0.21")
  })
  it("leaves sazba untouched for a non-period field", () => {
    expect(
      applyFieldChange(form({ sazba: "0.19" }), "slevy", "500").sazba,
    ).toBe("0.19")
  })
  it("applies the edited field's value", () => {
    expect(applyFieldChange(form(), "dic", "CZ99").dic).toBe("CZ99")
  })
})

describe("toZaverka", () => {
  const empty = { rozvahaAktiva: {}, rozvahaPasiva: {}, vzz: {} }

  it("reports every řádek of the plný rozsah, aggregates included", () => {
    const z = toZaverka(empty, "D", "plny")
    expect(z.aktiva).toHaveLength(77)
    expect(z.pasiva).toHaveLength(65)
    expect(z.vzz).toHaveLength(56)
  })

  it("reports only the časové-rozlišení variant the výkazy use", () => {
    // Filling both would put the same částka on the form twice.
    const radky = (cr: "C" | "D") =>
      toZaverka(empty, cr, "plny").aktiva.map((r) => r.radek)
    expect(radky("D")).toContain("078")
    expect(radky("D")).not.toContain("068")
    expect(radky("C")).toContain("068")
    expect(radky("C")).not.toContain("078")
  })

  it("shrinks with the rozsah", () => {
    const plny = toZaverka(empty, "D", "plny")
    const mikro = toZaverka(empty, "D", "mikro")
    expect(mikro.aktiva.length).toBeLessThan(plny.aktiva.length)
    expect(mikro.aktiva.map((r) => r.radek)).toContain("001")
  })

  it("evaluates the formulas instead of reading only what was typed", () => {
    // The store holds leaves; EPO wants a číslo on every řádek, so the
    // aggregates have to be computed here.
    const z = toZaverka(
      { ...empty, rozvahaAktiva: { "016": { brutto: 40612 } } },
      "D",
      "plny",
    )
    const celkem = z.aktiva.find((r) => r.radek === "001")
    expect(celkem?.brutto).toBe(40612)
  })

  it("omits korekce on a položka whose korekce column prints x", () => {
    const z = toZaverka(empty, "D", "plny")
    // C.II.1. Dlouhodobé pohledávky — the paper form prints "x" there.
    expect(z.aktiva.find((r) => r.radek === "047")).not.toHaveProperty(
      "korekce",
    )
    expect(z.aktiva.find((r) => r.radek === "001")).toHaveProperty("korekce")
  })
})

describe("toZadost", () => {
  it("asks for the three výkazy a podnikatel draws up", () => {
    expect(
      toZadost(form({ sbirkaListin: true, sbirkaEmail: "u@f.cz" })),
    ).toEqual({
      // prettier-ignore
      rozvaha: true,
      vzz: true,
      priloha: true,
      email: "u@f.cz",
    })
  })

  it("is undefined when the poplatník does not ask", () => {
    expect(toZadost(form({ sbirkaListin: false }))).toBeUndefined()
  })

  it("omits a blank e-mail rather than sending an empty one", () => {
    expect(toZadost(form({ sbirkaListin: true, sbirkaEmail: "  " }))?.email).toBeUndefined() // prettier-ignore
  })
})

describe("toMeta — poplatník and lhůta", () => {
  const org = {
    nazev: "Firma s.r.o.",
    ico: "12345679",
    sidlo: "Ulice 12",
    psc: "180 00",
    obec: "Praha 8",
    stat: "Česká republika",
    pravniForma: "s.r.o.",
    predmetPodnikani: "",
    rok: "2025",
    mesic: "12",
    keDni: "31.12.2025",
    sestavenoDne: "",
    schvalenoDne: "",
    vTisicich: true,
  }

  it("carries the signatory, the phone and the rozvahový den", () => {
    const m = toMeta(
      form({
        cTelef: "601 020 304",
        oprJmeno: "Jan",
        oprPrijmeni: "Novák",
        oprPostaveni: "STATUTÁRNÍ ORGÁN",
      }),
      org,
      "plny",
    )
    expect(m.c_telef).toBe("601020304")
    expect(m.opr_jmeno).toBe("Jan")
    expect(m.opr_prijmeni).toBe("Novák")
    expect(m.opr_postaveni).toBe("STATUTÁRNÍ ORGÁN")
    // Taken from the org block, not retyped: it is the same "ke dni" the výkazy
    // are drawn up to.
    expect(m.d_uv).toBe("31.12.2025")
  })

  it("reports audit and daňový poradce, which set the § 136 lhůta", () => {
    expect(toMeta(form({ audit: true, danPor: false }), org, "plny")).toMatchObject({ audit: "A", dan_por: "N" }) // prettier-ignore
    expect(toMeta(form({ audit: false, danPor: true }), org, "plny")).toMatchObject({ audit: "N", dan_por: "A" }) // prettier-ignore
    // The builder only ever draws up a řádná závěrka.
    expect(toMeta(form(), org, "plny").uz_rad).toBe("T")
  })

  it("leaves an unfilled signatory out entirely", () => {
    const m = toMeta(form(), org, "plny")
    expect(m.opr_jmeno).toBeUndefined()
    expect(m.c_telef).toBeUndefined()
  })
})
