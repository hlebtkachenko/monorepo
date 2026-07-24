// v2 -> v3 document migration: the rozvaha was renumbered when A.IV. was
// collapsed onto the two položky of the current příloha č. 1 and the second
// časové-rozlišení variant was added, so stored/exported documents must be
// moved onto the new řádek numbers instead of silently landing on wrong lines.

import { describe, expect, it } from "vitest"

import { DOC_VERSION, migrateRozvahaRadky } from "./storage"
import type { VykazyDoc } from "./storage"

function v2Doc(partial: Partial<VykazyDoc>): VykazyDoc {
  return {
    version: 2,
    org: {
      nazev: "",
      ico: "",
      sidlo: "",
      psc: "",
      obec: "",
      stat: "Česká republika",
      pravniForma: "",
      predmetPodnikani: "",
      rok: "",
      mesic: "",
      keDni: "",
      sestavenoDne: "",
      schvalenoDne: "",
      vTisicich: true,
    },
    values: { rozvahaAktiva: {}, rozvahaPasiva: {}, vzz: {} },
    rozsah: "plny",
    crVariant: "D",
    ...partial,
  }
}

describe("migrateRozvahaRadky", () => {
  it("sums the old A.IV.1 + A.IV.2 onto the merged A.IV.1", () => {
    const doc = migrateRozvahaRadky(
      v2Doc({
        values: {
          rozvahaAktiva: {},
          rozvahaPasiva: {
            "019": { bezne: 500, minule: 400 },
            "020": { bezne: -120, minule: -100 },
          },
          vzz: {},
        },
      }),
    )
    expect(doc.values.rozvahaPasiva["019"]).toEqual({
      bezne: 380,
      minule: 300,
    })
    expect(doc.values.rozvahaPasiva["020"]).toBeUndefined()
    expect(doc.version).toBe(DOC_VERSION)
  })

  it("shifts pasiva from A.IV.3 down by one and the D. block up by two", () => {
    const doc = migrateRozvahaRadky(
      v2Doc({
        values: {
          rozvahaAktiva: {},
          rozvahaPasiva: {
            "021": { bezne: 11 }, // old A.IV.3 Jiný VH -> new A.IV.2 (020)
            "022": { bezne: 22 }, // old A.V. -> 021
            "063": { bezne: 63 }, // old C.II.8.7 -> 062
            "064": { bezne: 64 }, // old D. -> 066
            "066": { bezne: 66 }, // old D.2 -> 068
          },
          vzz: {},
        },
      }),
    )
    expect(doc.values.rozvahaPasiva).toEqual({
      "020": { bezne: 11 },
      "021": { bezne: 22 },
      "062": { bezne: 63 },
      "066": { bezne: 64 },
      "068": { bezne: 66 },
    })
  })

  it("shifts aktiva from C.III. down by four and leaves 001–067 alone", () => {
    const doc = migrateRozvahaRadky(
      v2Doc({
        values: {
          rozvahaAktiva: {
            "017": { brutto: 17 },
            "068": { brutto: 68 }, // old C.III. -> 072
            "073": { brutto: 73 }, // old C.IV.2 -> 077
            "077": { brutto: 77 }, // old D.3 -> 081
          },
          rozvahaPasiva: {},
          vzz: {},
        },
      }),
    )
    expect(doc.values.rozvahaAktiva).toEqual({
      "017": { brutto: 17 },
      "072": { brutto: 68 },
      "077": { brutto: 73 },
      "081": { brutto: 77 },
    })
  })

  it("moves the override keys with their řádek", () => {
    const doc = migrateRozvahaRadky(
      v2Doc({
        overrides: {
          rozvahaAktiva: ["074:brutto"],
          rozvahaPasiva: ["022:bezne"],
          vzz: ["001:bezne"],
        },
      }),
    )
    expect(doc.overrides).toEqual({
      rozvahaAktiva: ["078:brutto"],
      rozvahaPasiva: ["021:bezne"],
      vzz: ["001:bezne"],
    })
  })

  it("leaves a v3 document untouched", () => {
    const doc = v2Doc({
      version: 3,
      values: {
        rozvahaAktiva: {},
        rozvahaPasiva: { "019": { bezne: 1 }, "020": { bezne: 2 } },
        vzz: {},
      },
    })
    expect(migrateRozvahaRadky(doc)).toBe(doc)
  })
})
