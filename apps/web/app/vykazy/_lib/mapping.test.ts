// The account -> výkaz-řádek mapping after the rozvaha was renumbered onto the
// current příloha č. 1. These cases pin the leaves that moved: the merged
// A.IV.1, the peněžní prostředky / krátkodobý finanční majetek block, and the
// časové rozlišení, which lands on a different položka in each of the two
// layouts of § 3 odst. 3 a 4 vyhlášky.

import { describe, expect, it } from "vitest"

import { ROZVAHA_AKTIVA, ROZVAHA_PASIVA } from "../_data/rozvaha"
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
        ROZVAHA_AKTIVA,
        "brutto",
        mapped.rozvahaAktiva,
      )
      const pasiva = computeColumn(
        ROZVAHA_PASIVA,
        "bezne",
        mapped.rozvahaPasiva,
      )
      expect(aktiva["001"], variant).toBe(120)
      expect(pasiva["001"], variant).toBe(120)
    }
  })
})
