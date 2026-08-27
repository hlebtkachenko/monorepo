// The account -> výkaz-řádek mapping after the rozvaha was renumbered onto the
// current příloha č. 1. These cases pin the leaves that moved: the merged
// A.IV.1, the peněžní prostředky / krátkodobý finanční majetek block, and the
// časové rozlišení, which lands on a different položka in each of the two
// layouts of § 3 odst. 3 a 4 vyhlášky.

import { describe, expect, it } from "vitest"

import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { computeColumn } from "./engine"
import { mapPredvahaToValues } from "./mapping"

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
    ucet: `${ucetNo}000`,
    synteticky: ucetNo,
    ks,
    obratMD: 0,
    obratDal: 0,
  }
}

describe("mapPredvahaToValues — rozvaha leaves", () => {
  it("puts both 428 and 429 on the merged A.IV.1 (ř. 019)", () => {
    const { rozvahaPasiva } = mapPredvahaToValues([
      ucet("428", -500_000), // nerozdělený zisk, credit balance
      ucet("429", 120_000), // neuhrazená ztráta, debit balance
    ])
    expect(rozvahaPasiva["019"]).toEqual({ bezne: 380 })
    expect(rozvahaPasiva["020"]).toBeUndefined()
  })

  it("keeps peněžní prostředky and KFM on their new řádky", () => {
    const { rozvahaAktiva } = mapPredvahaToValues([
      ucet("211", 10_000), // pokladna -> C.IV.1 (076)
      ucet("221", 20_000), // bankovní účty -> C.IV.2 (077)
      ucet("251", 30_000), // CP k obchodování -> C.III.2 (074)
    ])
    expect(rozvahaAktiva["076"]).toEqual({ brutto: 10 })
    expect(rozvahaAktiva["077"]).toEqual({ brutto: 20 })
    expect(rozvahaAktiva["074"]).toEqual({ brutto: 30 })
  })

  it("routes časové rozlišení by the selected layout", () => {
    const rows = [
      ucet("381", 5_000), // náklady příštích období
      ucet("385", 3_000), // příjmy příštích období
      ucet("383", -2_000), // výdaje příštích období
      ucet("384", -1_000), // výnosy příštích období
    ]

    const d = mapPredvahaToValues(rows, "D")
    expect(d.rozvahaAktiva["079"]).toEqual({ brutto: 5 })
    expect(d.rozvahaAktiva["081"]).toEqual({ brutto: 3 })
    expect(d.rozvahaPasiva["067"]).toEqual({ bezne: 2 })
    expect(d.rozvahaPasiva["068"]).toEqual({ bezne: 1 })

    const c = mapPredvahaToValues(rows, "C")
    expect(c.rozvahaAktiva["069"]).toEqual({ brutto: 5 })
    expect(c.rozvahaAktiva["071"]).toEqual({ brutto: 3 })
    expect(c.rozvahaPasiva["064"]).toEqual({ bezne: 2 })
    expect(c.rozvahaPasiva["065"]).toEqual({ bezne: 1 })
    expect(c.rozvahaAktiva["079"]).toBeUndefined()
    expect(c.rozvahaPasiva["067"]).toBeUndefined()
  })

  it("ties AKTIVA to PASIVA when per-cell rounding would not", () => {
    // 1 500 + 1 500 Kč of aktiva against 3 000 Kč of pasiva. Rounding each cell
    // on its own prints AKTIVA 2 + 2 = 4 against PASIVA 3 — the classic 1 tis.
    // gap. The allocation rounds each side to the tisíc it actually totals.
    const mapped = mapPredvahaToValues([
      ucet("211", 1_500),
      ucet("221", 1_500),
      ucet("411", -3_000),
    ])
    const aktiva = computeColumn(
      rozvahaAktiva("D"),
      "netto",
      mapped.rozvahaAktiva,
    )
    const pasiva = computeColumn(
      rozvahaPasiva("D"),
      "bezne",
      mapped.rozvahaPasiva,
    )
    expect(aktiva["001"]).toBe(3)
    expect(pasiva["001"]).toBe(3)
    // The 1 tis. is taken off one cell, not invented on a plug line.
    expect(
      (mapped.rozvahaAktiva["076"]?.brutto ?? 0) +
        (mapped.rozvahaAktiva["077"]?.brutto ?? 0),
    ).toBe(3)
  })

  it("ties both sides when the výsledek hospodaření carries the rounding", () => {
    // Aktiva 10 400,50; závazky 400,50; the rest is the výsledek from a výnos.
    const mapped = mapPredvahaToValues([
      {
        ucet: "221000",
        synteticky: "221",
        ks: 10_400.5,
        obratMD: 0,
        obratDal: 0,
      },
      {
        ucet: "321000",
        synteticky: "321",
        ks: -400.5,
        obratMD: 0,
        obratDal: 0,
      },
      {
        ucet: "602000",
        synteticky: "602",
        ks: -10_000,
        obratMD: 0,
        obratDal: 10_000,
      },
    ])
    const aktiva = computeColumn(
      rozvahaAktiva("D"),
      "netto",
      mapped.rozvahaAktiva,
    )
    const pasiva = computeColumn(
      rozvahaPasiva("D"),
      "bezne",
      mapped.rozvahaPasiva,
    )
    expect(aktiva["001"]).toBe(pasiva["001"])
    // Rozvaha A.V. and VZZ ř. 55 must report the same figure.
    const vzz = computeColumn(VZZ, "bezne", mapped.vzz)
    expect(mapped.rozvahaPasiva["021"]?.bezne).toBe(vzz["055"])
  })

  it("balances a minimal book under either layout", () => {
    // 100k stavby + 20k náklady příštích období against 120k základní kapitál.
    const rows = [
      ucet("021", 100_000),
      ucet("381", 20_000),
      ucet("411", -120_000),
    ]
    for (const variant of ["C", "D"] as const) {
      const mapped = mapPredvahaToValues(rows, variant)
      const aktiva = computeColumn(
        rozvahaAktiva(variant),
        "netto",
        mapped.rozvahaAktiva,
      )
      const pasiva = computeColumn(
        rozvahaPasiva(variant),
        "bezne",
        mapped.rozvahaPasiva,
      )
      expect(aktiva["001"], variant).toBe(120)
      expect(pasiva["001"], variant).toBe(120)
    }
  })

  it("reports the rezerva na daň z příjmů (599) as L.1, not as a provozní rezerva", () => {
    // § 27 vyhlášky limits "F.4. Rezervy v provozní oblasti" to účtová skupina
    // 55, so 599 belongs to "L.1. Daň z příjmů splatná" — otherwise the VZZ
    // understates ř.049 Výsledek hospodaření před zdaněním by the provision.
    const { vzz } = mapPredvahaToValues([
      {
        ucet: "599000",
        synteticky: "599",
        ks: 0,
        obratMD: 40_000,
        obratDal: 0,
      },
      {
        ucet: "602000",
        synteticky: "602",
        ks: 0,
        obratMD: 0,
        obratDal: 200_000,
      },
    ])
    expect(vzz["051"]).toEqual({ bezne: 40 })
    expect(vzz["028"]).toBeUndefined()
    const computed = computeColumn(VZZ, "bezne", vzz)
    expect(computed["049"]).toBe(200) // VH před zdaněním — nedotčen rezervou
    expect(computed["050"]).toBe(40) // L. Daň z příjmů
    expect(computed["055"]).toBe(160)
  })

  it("lets the účtový rozvrh place an analytika of 395 on the závazek side", () => {
    // 395 vnitřní zúčtování is the case the override exists for: the vyhláška
    // maps the synthetic to a pohledávka, but an analytika that carries a
    // závazek belongs on the pasiva side. Both analytiky post 30 000 MD/Dal so
    // the two sides of the rozvaha stay equal either way.
    const rows = [
      { ucet: "395001", synteticky: "395", ks: 30_000, obratMD: 30_000, obratDal: 0 }, // prettier-ignore
      { ucet: "395002", synteticky: "395", ks: -30_000, obratMD: 0, obratDal: 30_000 }, // prettier-ignore
    ]

    const dleVyhlasky = mapPredvahaToValues(rows, "D")
    const sRozvrhem = mapPredvahaToValues(rows, "D", [
      { ucet: "395001", nazev: "Vnitřní zúčtování: pohledávky" },
      { ucet: "395002", nazev: "Vnitřní zúčtování: závazky", vykaz: "rozvaha-pasiva", rada: "062" }, // prettier-ignore
    ])

    // Without the override both analytiky net to zero on the aktiva side.
    expect(computeColumn(rozvahaAktiva("D"), "brutto", dleVyhlasky.rozvahaAktiva)["001"]).toBe(0) // prettier-ignore
    expect(dleVyhlasky.rozvahaPasiva["062"]).toBeUndefined()

    // With it, the závazek analytika reports as C.II.8.7. Jiné závazky (30 tis.)
    // and the pohledávka stays on the aktiva side at its own 30 tis.
    expect(sRozvrhem.rozvahaPasiva["062"]).toEqual({ bezne: 30 })
    expect(computeColumn(rozvahaAktiva("D"), "brutto", sRozvrhem.rozvahaAktiva)["001"]).toBe(30) // prettier-ignore
  })
})
