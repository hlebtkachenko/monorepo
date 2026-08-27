import { describe, expect, it } from "vitest"

import { buildSpojeneVety, spojZahr, type DppoSpojenaOsoba } from "./spojene"
import { buildDppoFromAccounting } from "./adapter"
import { checkDppo } from "./checks"
import { generateDppo } from "./write"
import { DppoSchema } from "../../../model/dppo"
import { validateFiling } from "../../../validate/validate"

const osoba = (over: Partial<DppoSpojenaOsoba> = {}): DppoSpojenaOsoba => ({
  nazev: "Dodavatel s.r.o.",
  ic: "00000019",
  stat: "CZ",
  ...over,
})

const attrsOf = (o: DppoSpojenaOsoba) => buildSpojeneVety([o])[0]!.attrs

describe("the two columns of a transaction row", () => {
  // The XSD documents each attribute separately and the meanings differ by row.
  // Any of these landing on the other half would misstate the return while
  // validating green, so each of the five kinds is pinned here.
  it("puts a náklad in _sl2 and a výnos in _sl1", () => {
    const a = attrsOf(osoba({ transakce: { sluzby: { vynos: 0, naklad: 8011 } } })) // prettier-ignore
    expect(a.sluzby_sl1).toBe("0")
    expect(a.sluzby_sl2).toBe("8011")
  })

  it("puts a prodej in _sl1 and a pořizovací cena in _sl2", () => {
    const a = attrsOf(osoba({ transakce: { hmotnyMajetek: { prodej: 140, nakup: 60 } } })) // prettier-ignore
    expect(a.hmot_sl1).toBe("140")
    expect(a.hmot_sl2).toBe("60")
  })

  it("puts a přijatý úvěr in _sl1 and a vyplacený in _sl2", () => {
    const a = attrsOf(osoba({ transakce: { uveroveNastroje: { prijate: 0, vyplacene: 2400 } } })) // prettier-ignore
    expect(a.uver_sl1).toBe("0")
    expect(a.uver_sl2).toBe("2400")
  })

  it("puts zvýšení vlastního kapitálu in _sl1 and snížení in _sl2", () => {
    const a = attrsOf(osoba({ transakce: { ostatniVlastniKapital: { zvyseni: 500, snizeni: 0 } } })) // prettier-ignore
    expect(a.ost_vlkap_sl1).toBe("500")
    expect(a.ost_vlkap_sl2).toBe("0")
  })

  it("puts the aktuální stav in _sl1 and the minulý in _sl2", () => {
    // A stav row is not a flow row: swapping these would report last year's
    // balance as this year's.
    const a = attrsOf(osoba({ transakce: { kratkodobePohledavky: { aktualni: 6292, minule: 3201 } } })) // prettier-ignore
    expect(a.krpohl_sl1).toBe("6292")
    expect(a.krpohl_sl2).toBe("3201")
  })
})

describe("buildSpojeneVety", () => {
  it("ships both halves of an active pair, the idle one as a reported zero", () => {
    // Pinned to a real DPPDP9 the portal accepted: ř. Nájem carries
    // najem_sl1="0" alongside najem_sl2="252", not a single attribute.
    const a = attrsOf(osoba({ transakce: { najem: { naklad: 252 } } }))
    expect(a.najem_sl1).toBe("0")
    expect(a.najem_sl2).toBe("252")
  })

  it("omits a pair with no activity rather than filing a zero row", () => {
    const a = attrsOf(osoba({ transakce: { sluzby: { naklad: 302 } } }))
    expect(Object.keys(a).filter((k) => k.endsWith("_sl1"))).toEqual(["sluzby_sl1"]) // prettier-ignore
    expect(a.urok_sl1).toBeUndefined()
    expect(a.krpohl_sl2).toBeUndefined()
  })

  it("always answers all five příznaky, N when not ticked", () => {
    // An absent flag reads as unanswered; the filed return carries every one.
    const a = attrsOf(osoba({ zarukaPrijata: true }))
    expect(a).toMatchObject({
      cashpool: "N",
      bezupl_pos: "N",
      bezupl_prij: "N",
      fbzar_prij: "A",
      fbzar_pos: "N",
    })
  })

  it("carries identity as the poplatník typed it, státy uppercased", () => {
    const a = attrsOf(osoba({ nazev: "  Dodavatel s.r.o. ", stat: "sk" }))
    expect(a.naz_spojos).toBe("Dodavatel s.r.o.")
    expect(a.ic_spojos).toBe("00000019")
    expect(a.stat_spojos).toBe("SK")
  })

  it("rounds to whole thousands", () => {
    const a = attrsOf(osoba({ transakce: { uroky: { vynos: 37.6, naklad: -0.4 } } })) // prettier-ignore
    expect(a.urok_sl1).toBe("38")
    expect(a.urok_sl2).toBe("0")
  })

  it("drops an entirely blank entry a repeating table left behind", () => {
    expect(buildSpojeneVety([{ nazev: "  ", stat: "" }])).toEqual([])
    expect(buildSpojeneVety([{ nazev: "", stat: "", transakce: {} }])).toEqual([]) // prettier-ignore
  })

  it("keeps an entry that has transakce but no název", () => {
    // Discarding a transaction the poplatník typed in would be worse than
    // filing a row EPO queries; checkDppo flags it instead.
    const vety = buildSpojeneVety([
      { nazev: "", stat: "CZ", transakce: { sluzby: { naklad: 254 } } },
    ])
    expect(vety).toHaveLength(1)
    expect(vety[0]!.attrs.naz_spojos).toBeUndefined()
    expect(vety[0]!.attrs.sluzby_sl2).toBe("254")
  })

  it("emits one věta per osoba", () => {
    const vety = buildSpojeneVety([osoba(), osoba({ nazev: "Jiný s.r.o." })])
    expect(vety.map((v) => v.tag)).toEqual(["VetaA", "VetaA"])
  })
})

describe("spojZahr — I. oddíl položka 12", () => {
  it.each([
    ["tuzemská jen", ["CZ", "CZ"], "T"],
    ["zahraniční jen", ["SK", "DE"], "Z"],
    ["obojí", ["CZ", "SK"], "A"],
    ["žádná", [], "N"],
  ])("%s", (_label, staty, expected) => {
    expect(spojZahr(staty.map((stat) => osoba({ stat })))).toBe(expected)
  })

  it("ignores a blank entry", () => {
    expect(spojZahr([osoba({ stat: "CZ" }), { nazev: "", stat: "" }])).toBe("T")
  })
})

describe("the samostatná příloha inside a whole return", () => {
  const figures = {
    ucetni_vysledek: "-4848968",
    nedanove_naklady: "0",
    osvobozene_vynosy: "0",
    odpocet_ztraty: "0",
    sazba: "0.21",
    slevy: "0",
  }
  const meta = {
    zdobd_od: "1.1.2025",
    zdobd_do: "31.12.2025",
    c_ufo_cil: "451",
    dic: "CZ00000019",
  }

  it("validates against the vendored DPPDP9 XSD", async () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, undefined, undefined, [
        osoba({ transakce: { kratkodobePohledavky: { aktualni: 6292, minule: 3201 } } }), // prettier-ignore
        osoba({ nazev: "Jiný s.r.o.", transakce: { sluzby: { naklad: 8011 } } }), // prettier-ignore
      ]),
    )
    const result = await validateFiling(generateDppo(model), "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("sits after the účetní závěrka and before the žádost", () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(
        figures,
        meta,
        undefined,
        { aktiva: [{ radek: "001", netto: 1 }], pasiva: [], vzz: [] },
        { rozvaha: true },
        [osoba()],
      ),
    )
    expect(model.extraVety.map((v) => v.tag)).toEqual([
      "VetaUA",
      "VetaA",
      "VetaUZ",
    ])
  })

  it("declares položka 12 from the states of the osoby", () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, undefined, undefined, [
        osoba(),
        osoba({ nazev: "Zahraniční GmbH", stat: "DE" }),
      ]),
    )
    expect(model.header.spoj_zahr).toBe("A")
  })

  it("lets the caller declare položka 12 without filing the příloha", () => {
    // Transakce can happen without meeting the Pokyny's podmínky for the
    // samostatná příloha, so the declaration is broader than the list.
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, { ...meta, spoj_zahr: "T" }),
    )
    expect(model.header.spoj_zahr).toBe("T")
    expect(model.extraVety).toEqual([])
  })

  it("leaves položka 12 alone when nothing was passed", () => {
    const model = DppoSchema.parse(buildDppoFromAccounting(figures, meta))
    expect(model.header.spoj_zahr).toBeUndefined()
  })
})

describe("the checks a green XSD badge would otherwise hide", () => {
  const figures = {
    ucetni_vysledek: "-1",
    nedanove_naklady: "0",
    osvobozene_vynosy: "0",
    odpocet_ztraty: "0",
    sazba: "0.21",
    slevy: "0",
  }
  const meta = {
    zdobd_od: "1.1.2025",
    zdobd_do: "31.12.2025",
    c_ufo_cil: "451",
    dic: "CZ00000019",
  }
  const codesFor = (osoby: DppoSpojenaOsoba[], spoj_zahr?: string) =>
    checkDppo(
      DppoSchema.parse(
        buildDppoFromAccounting(
          figures,
          { ...meta, ...(spoj_zahr ? { spoj_zahr } : {}) },
          undefined,
          undefined,
          undefined,
          osoby,
        ),
      ),
    ).map((c) => c.code)

  it("warns when a list row has no název or no stát", async () => {
    const osoby = [
      { nazev: "", stat: "", transakce: { sluzby: { naklad: 1 } } },
    ]
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, undefined, undefined, osoby), // prettier-ignore
    )
    const xsd = await validateFiling(generateDppo(model), "dppo", "05.01.01")
    expect(xsd.valid).toBe(true)
    expect(checkDppo(model).map((c) => c.code)).toEqual(
      expect.arrayContaining(["naz_spojos.required", "stat_spojos.required"]),
    )
  })

  it("warns on two listy with the same název + stát", () => {
    // The XSD's own words: "V souboru nesmí existovat duplicitní listy přílohy."
    expect(codesFor([osoba(), osoba()])).toContain("spojene.duplicate")
    expect(codesFor([osoba(), osoba({ stat: "SK" })])).not.toContain("spojene.duplicate") // prettier-ignore
  })

  it("warns when položka 12 contradicts the příloha", () => {
    expect(codesFor([osoba()], "N")).toContain("spoj_zahr.required")
    expect(codesFor([osoba()])).not.toContain("spoj_zahr.required")
  })

  it("stays quiet on a well-formed list", () => {
    const codes = codesFor([osoba(), osoba({ nazev: "Jiný s.r.o." })])
    expect(codes).not.toContain("naz_spojos.required")
    expect(codes).not.toContain("stat_spojos.required")
    expect(codes).not.toContain("spojene.duplicate")
  })
})
