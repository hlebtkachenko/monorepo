// Účetní rozvrh: the entity owns its analytické účty (name + výkaz placement),
// the vyhláška owns the syntetické ones. These cases pin that boundary, the CSV
// round-trip, and the effect a placement has on the mapped výkaz.

import { describe, expect, it } from "vitest"

import { mapPredvahaToValues } from "./mapping"
import {
  buildRozvrhIndex,
  isSynteticky,
  osnovaNazev,
  parseRozvrhCsv,
  resolveNazev,
  resolveOpravkovy,
  rozvrhCsv,
  seedRozvrh,
} from "./rozvrh"
import type { RozvrhAccount } from "./rozvrh"

/** One předvaha row in Kč; the mapper reports v celých tisících Kč. */
function ucet(
  ucetNo: string,
  ks: number,
): {
  ucet: string
  synteticky: string
  ks: number
  obratMD: number
  obratDal: number
} {
  return {
    ucet: ucetNo,
    synteticky: ucetNo.slice(0, 3),
    ks,
    obratMD: 0,
    obratDal: 0,
  }
}

describe("isSynteticky", () => {
  it("treats the bare synthetic and its XXX000 base as law-owned", () => {
    expect(isSynteticky("311")).toBe(true)
    expect(isSynteticky("311000")).toBe(true)
    expect(isSynteticky("31100")).toBe(true)
  })

  it("treats a real analytika as the entity's own", () => {
    expect(isSynteticky("311100")).toBe(false)
    expect(isSynteticky("311001")).toBe(false)
  })
})

describe("resolveNazev", () => {
  it("prefers the entity's own name over the osnova", () => {
    const index = buildRozvrhIndex([
      { ucet: "311100", nazev: "Odběratelé - tuzemsko" },
    ])
    expect(resolveNazev("311100", index)).toBe("Odběratelé - tuzemsko")
  })

  it("falls back to the osnova synthetic for an unlisted analytika", () => {
    const index = buildRozvrhIndex([])
    expect(resolveNazev("311100", index)).toBe(osnovaNazev("311000"))
    expect(resolveNazev("311100", index)).not.toBe("")
  })

  it("ignores an empty own name", () => {
    const index = buildRozvrhIndex([{ ucet: "311100", nazev: "  " }])
    expect(resolveNazev("311100", index)).toBe(osnovaNazev("311000"))
  })
})

describe("resolveOpravkovy", () => {
  it("inherits the osnova flag through the syntetický účet", () => {
    // 081 Oprávky ke stavbám — the analytika is not in the osnova at all.
    expect(resolveOpravkovy("081100", buildRozvrhIndex([]))).toBe(true)
    expect(resolveOpravkovy("021100", buildRozvrhIndex([]))).toBe(false)
  })

  it("lets the rozvrh flag an account the osnova does not know", () => {
    const index = buildRozvrhIndex([
      { ucet: "021900", nazev: "Opravná položka ke stavbám", opravkovy: true },
    ])
    expect(resolveOpravkovy("021900", index)).toBe(true)
  })
})

describe("parseRozvrhCsv", () => {
  it("reads účet, název, placement and the korekce flag", () => {
    const csv = [
      "Účet;Název;Výkaz;Řádek;Opravkový",
      "311100;Odběratelé - tuzemsko;;;",
      "395100;Vnitřní zúčtování - závazky;Pasiva;062;",
      "021900;Opravná položka;Aktiva;017;ano",
    ].join("\r\n")
    const result = parseRozvrhCsv(csv)

    expect(result.headerOk).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.accounts).toEqual([
      { ucet: "311100", nazev: "Odběratelé - tuzemsko" },
      {
        ucet: "395100",
        nazev: "Vnitřní zúčtování - závazky",
        vykaz: "rozvaha-pasiva",
        rada: "062",
      },
      {
        ucet: "021900",
        nazev: "Opravná položka",
        vykaz: "rozvaha-aktiva",
        rada: "017",
        opravkovy: true,
      },
    ])
  })

  it("reports missing required headers", () => {
    const result = parseRozvrhCsv("Účet;Výkaz\r\n311100;Aktiva")
    expect(result.headerOk).toBe(false)
    expect(result.missingHeaders).toEqual(["Název"])
    expect(result.accounts).toEqual([])
  })

  it("keeps the name but drops a placement aimed at a syntetický účet", () => {
    const result = parseRozvrhCsv(
      "Účet;Název;Výkaz;Řádek\r\n311000;Odběratelé;Pasiva;062",
    )
    expect(result.accounts).toEqual([{ ucet: "311000", nazev: "Odběratelé" }])
    expect(result.warnings[0]).toContain("syntetický")
  })

  it("drops a placement onto a calc řádek (not a leaf)", () => {
    // Aktiva ř. 001 is AKTIVA CELKEM — a sum, never a posting target.
    const result = parseRozvrhCsv(
      "Účet;Název;Výkaz;Řádek\r\n311100;Odběratelé;Aktiva;001",
    )
    expect(result.accounts).toEqual([{ ucet: "311100", nazev: "Odběratelé" }])
    expect(result.warnings[0]).toContain("není vstupní položkou")
  })

  it("drops rows that are not account numbers, and duplicates", () => {
    const result = parseRozvrhCsv(
      [
        "Účet;Název",
        "XX;Nesmysl",
        "311100;Odběratelé",
        "311100;Odběratelé znovu",
      ].join("\r\n"),
    )
    expect(result.accounts).toEqual([{ ucet: "311100", nazev: "Odběratelé" }])
    expect(result.warnings).toHaveLength(2)
  })

  it("round-trips through rozvrhCsv", () => {
    const accounts: RozvrhAccount[] = [
      { ucet: "311100", nazev: "Odběratelé; tuzemsko" },
      {
        ucet: "395100",
        nazev: "Vnitřní zúčtování",
        vykaz: "vzz",
        rada: "029",
        opravkovy: true,
      },
    ]
    expect(parseRozvrhCsv(rozvrhCsv(accounts)).accounts).toEqual(accounts)
  })
})

describe("seedRozvrh", () => {
  it("lists the deník accounts with osnova names, sorted", () => {
    const seeded = seedRozvrh(
      ["321000", "311100"],
      [{ ucet: "311100", nazev: "Odběratelé - tuzemsko" }],
    )
    expect(seeded.map((a) => a.ucet)).toEqual(["311100", "321000"])
    expect(seeded[0]?.nazev).toBe("Odběratelé - tuzemsko")
    expect(seeded[1]?.nazev).toBe(osnovaNazev("321000"))
  })
})

describe("mapPredvahaToValues with a rozvrh", () => {
  it("moves an analytika onto the řádek the rozvrh names", () => {
    // 395 maps to aktiva "Jiné pohledávky" (067) by law; this analytika is a
    // payable, so the rozvrh sends it to pasiva "Jiné závazky" (062).
    const rozvrh: RozvrhAccount[] = [
      {
        ucet: "395100",
        nazev: "Vnitřní zúčtování - závazky",
        vykaz: "rozvaha-pasiva",
        rada: "062",
      },
    ]
    const withRozvrh = mapPredvahaToValues(
      [ucet("395100", -40_000)],
      "D",
      rozvrh,
    )
    expect(withRozvrh.rozvahaPasiva["062"]).toEqual({ bezne: 40 })
    expect(withRozvrh.rozvahaAktiva["067"]).toBeUndefined()

    const lawOnly = mapPredvahaToValues([ucet("395100", -40_000)])
    expect(lawOnly.rozvahaAktiva["067"]).toEqual({ brutto: -40 })
  })

  it("leaves a syntetický účet where the vyhláška places it", () => {
    // The parser refuses such a placement; a hand-written doc is refused here.
    const rozvrh: RozvrhAccount[] = [
      {
        ucet: "395000",
        nazev: "Vnitřní zúčtování",
        vykaz: "rozvaha-pasiva",
        rada: "062",
      },
    ]
    const { rozvahaAktiva, rozvahaPasiva } = mapPredvahaToValues(
      [ucet("395000", 40_000)],
      "D",
      rozvrh,
    )
    expect(rozvahaAktiva["067"]).toEqual({ brutto: 40 })
    expect(rozvahaPasiva["062"]).toBeUndefined()
  })

  it("sends a rozvrh-flagged analytika to the korekce column", () => {
    const rozvrh: RozvrhAccount[] = [
      {
        ucet: "021900",
        nazev: "Opravná položka ke stavbám",
        vykaz: "rozvaha-aktiva",
        rada: "017",
        opravkovy: true,
      },
    ]
    const { rozvahaAktiva } = mapPredvahaToValues(
      [ucet("021900", -15_000)],
      "D",
      rozvrh,
    )
    expect(rozvahaAktiva["017"]).toEqual({ korekce: -15 })
  })

  it("moves a placement onto its C-layout counterpart", () => {
    // Aktiva D.1 (079) is C.II.3.1 (069) under the other časové-rozlišení layout.
    const rozvrh: RozvrhAccount[] = [
      {
        ucet: "381100",
        nazev: "Náklady příštích období - nájem",
        vykaz: "rozvaha-aktiva",
        rada: "079",
      },
    ]
    const { rozvahaAktiva } = mapPredvahaToValues(
      [ucet("381100", 5_000)],
      "C",
      rozvrh,
    )
    expect(rozvahaAktiva["069"]).toEqual({ brutto: 5 })
    expect(rozvahaAktiva["079"]).toBeUndefined()
  })
})
