// Guards for the statutory forms themselves: the item list of rozvaha (příloha
// č. 1) and výkazu zisku a ztráty v druhovém členění (příloha č. 2) of vyhláška
// č. 500/2002 Sb., ve znění účinném od 1. 1. 2024, the § 3a rozsah subsets, and
// the § 3 odst. 3 a 4 časové-rozlišení variants.
//
// The označení lists below are transcribed from the annex text and are the
// reference the data files are diffed against — update them only together with
// a real novela.

import { describe, expect, it } from "vitest"

import { ROZVAHA_AKTIVA, ROZVAHA_PASIVA } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { computeColumn } from "./engine"
import { inRozsah } from "./rozsah"
import type { CasoveRozliseni, VykazStatement } from "./types"

const AKTIVA_OZN = [
  "",
  "A.",
  "B.",
  "B.I.",
  "B.I.1.",
  "B.I.2.",
  "B.I.2.1.",
  "B.I.2.2.",
  "B.I.3.",
  "B.I.4.",
  "B.I.5.",
  "B.I.5.1.",
  "B.I.5.2.",
  "B.II.",
  "B.II.1.",
  "B.II.1.1.",
  "B.II.1.2.",
  "B.II.2.",
  "B.II.3.",
  "B.II.4.",
  "B.II.4.1.",
  "B.II.4.2.",
  "B.II.4.3.",
  "B.II.5.",
  "B.II.5.1.",
  "B.II.5.2.",
  "B.III.",
  "B.III.1.",
  "B.III.2.",
  "B.III.3.",
  "B.III.4.",
  "B.III.5.",
  "B.III.6.",
  "B.III.7.",
  "B.III.7.1.",
  "B.III.7.2.",
  "C.",
  "C.I.",
  "C.I.1.",
  "C.I.2.",
  "C.I.3.",
  "C.I.3.1.",
  "C.I.3.2.",
  "C.I.4.",
  "C.I.5.",
  "C.II.",
  "C.II.1.",
  "C.II.1.1.",
  "C.II.1.2.",
  "C.II.1.3.",
  "C.II.1.4.",
  "C.II.1.5.",
  "C.II.1.5.1.",
  "C.II.1.5.2.",
  "C.II.1.5.3.",
  "C.II.1.5.4.",
  "C.II.2.",
  "C.II.2.1.",
  "C.II.2.2.",
  "C.II.2.3.",
  "C.II.2.4.",
  "C.II.2.4.1.",
  "C.II.2.4.2.",
  "C.II.2.4.3.",
  "C.II.2.4.4.",
  "C.II.2.4.5.",
  "C.II.2.4.6.",
  "C.II.3.",
  "C.II.3.1.",
  "C.II.3.2.",
  "C.II.3.3.",
  "C.III.",
  "C.III.1.",
  "C.III.2.",
  "C.IV.",
  "C.IV.1.",
  "C.IV.2.",
  "D.",
  "D.1.",
  "D.2.",
  "D.3.",
]

const PASIVA_OZN = [
  "",
  "A.",
  "A.I.",
  "A.I.1.",
  "A.I.2.",
  "A.I.3.",
  "A.II.",
  "A.II.1.",
  "A.II.2.",
  "A.II.2.1.",
  "A.II.2.2.",
  "A.II.2.3.",
  "A.II.2.4.",
  "A.II.2.5.",
  "A.III.",
  "A.III.1.",
  "A.III.2.",
  "A.IV.",
  "A.IV.1.",
  "A.IV.2.",
  "A.V.",
  "A.VI.",
  "B.+C.",
  "B.",
  "B.1.",
  "B.2.",
  "B.3.",
  "B.4.",
  "C.",
  "C.I.",
  "C.I.1.",
  "C.I.1.1.",
  "C.I.1.2.",
  "C.I.2.",
  "C.I.3.",
  "C.I.4.",
  "C.I.5.",
  "C.I.6.",
  "C.I.7.",
  "C.I.8.",
  "C.I.9.",
  "C.I.9.1.",
  "C.I.9.2.",
  "C.I.9.3.",
  "C.II.",
  "C.II.1.",
  "C.II.1.1.",
  "C.II.1.2.",
  "C.II.2.",
  "C.II.3.",
  "C.II.4.",
  "C.II.5.",
  "C.II.6.",
  "C.II.7.",
  "C.II.8.",
  "C.II.8.1.",
  "C.II.8.2.",
  "C.II.8.3.",
  "C.II.8.4.",
  "C.II.8.5.",
  "C.II.8.6.",
  "C.II.8.7.",
  "C.III.",
  "C.III.1.",
  "C.III.2.",
  "D.",
  "D.1.",
  "D.2.",
]

const STATEMENTS = [ROZVAHA_AKTIVA, ROZVAHA_PASIVA, VZZ]

function radaSet(statement: VykazStatement): Set<string> {
  return new Set(statement.lines.map((line) => line.rada))
}

describe("statutory item list", () => {
  it("rozvaha aktiva matches příloha č. 1 (both časové-rozlišení variants)", () => {
    expect(ROZVAHA_AKTIVA.lines.map((l) => l.ozn)).toEqual(AKTIVA_OZN)
  })

  it("rozvaha pasiva matches příloha č. 1 (both časové-rozlišení variants)", () => {
    expect(ROZVAHA_PASIVA.lines.map((l) => l.ozn)).toEqual(PASIVA_OZN)
  })

  it("A.IV. carries the two položky the current form has", () => {
    const aIV = ROZVAHA_PASIVA.lines.filter((l) => /^A\.IV\.\d/.test(l.ozn))
    expect(aIV.map((l) => [l.ozn, l.rada, l.text])).toEqual([
      [
        "A.IV.1.",
        "019",
        "Nerozdělený zisk nebo neuhrazená ztráta minulých let (+/-)",
      ],
      ["A.IV.2.", "020", "Jiný výsledek hospodaření minulých let (+/-)"],
    ])
  })

  it("VZZ has all 56 položek of příloha č. 2 in order", () => {
    expect(VZZ.lines).toHaveLength(56)
    expect(VZZ.lines.map((l) => l.rada)).toEqual(
      Array.from({ length: 56 }, (_, i) => String(i + 1).padStart(3, "0")),
    )
    expect(VZZ.lines.at(-1)?.text).toBe("Čistý obrat za účetní období")
  })

  it("ř. 56 Čistý obrat is I. + II. per § 1d odst. 2 ZoÚ, and overridable per § 35", () => {
    const line = VZZ.lines.find((l) => l.rada === "056")
    expect(line?.formula).toBe("001+002")
    expect(line?.overridable).toBe(true)
  })
})

describe("structure", () => {
  it.each(STATEMENTS)("$id has unique řádky", (statement) => {
    expect(radaSet(statement).size).toBe(statement.lines.length)
  })

  it.each(STATEMENTS)("$id formulas reference existing řádky", (statement) => {
    const known = radaSet(statement)
    for (const line of statement.lines) {
      for (const ref of line.formula?.split(/[+-]/) ?? []) {
        expect(known, `${statement.id} ř. ${line.rada}`).toContain(ref)
      }
    }
  })

  it.each(STATEMENTS)("$id evaluates without a formula cycle", (statement) => {
    expect(() => computeColumn(statement, "bezne", {})).not.toThrow()
  })

  it("aktiva and pasiva balance when the same leaves are filled", () => {
    // 100 of stavby against 100 of základní kapitál — the totals must foot on
    // both sides through every intermediate aggregate.
    const aktiva = computeColumn(ROZVAHA_AKTIVA, "brutto", {
      "017": { brutto: 100 },
    })
    const pasiva = computeColumn(ROZVAHA_PASIVA, "bezne", {
      "004": { bezne: 100 },
    })
    expect(aktiva["001"]).toBe(100)
    expect(pasiva["001"]).toBe(100)
  })

  it.each(["C", "D"] as CasoveRozliseni[])(
    "časové rozlišení in variant %s reaches AKTIVA/PASIVA CELKEM",
    (variant) => {
      const aktivaLeaf = variant === "C" ? "069" : "079"
      const pasivaLeaf = variant === "C" ? "064" : "067"
      expect(
        computeColumn(ROZVAHA_AKTIVA, "brutto", {
          [aktivaLeaf]: { brutto: 7 },
        })["001"],
      ).toBe(7)
      expect(
        computeColumn(ROZVAHA_PASIVA, "bezne", { [pasivaLeaf]: { bezne: 7 } })[
          "001"
        ],
      ).toBe(7)
    },
  )

  it("every časové-rozlišení line belongs to exactly one variant", () => {
    for (const statement of [ROZVAHA_AKTIVA, ROZVAHA_PASIVA]) {
      const cr = statement.lines.filter((l) =>
        l.text.startsWith("Časové rozlišení"),
      )
      expect(cr.every((l) => l.crVariant !== undefined)).toBe(true)
    }
  })
})

describe("§ 3a rozsah subsets", () => {
  const shown = (statement: VykazStatement, rozsah: "mala" | "mikro") =>
    statement.lines
      .filter((line) => inRozsah(statement.id, line, rozsah))
      .map((line) => line.ozn)

  it("mikro rozvaha keeps only položky označené písmeny", () => {
    expect(shown(ROZVAHA_AKTIVA, "mikro")).toEqual(["", "A.", "B.", "C.", "D."])
    expect(shown(ROZVAHA_PASIVA, "mikro")).toEqual([
      "",
      "A.",
      "B.+C.",
      "B.",
      "C.",
      "D.",
    ])
  })

  it("malá rozvaha adds římské číslice plus C.II.1–C.II.3", () => {
    expect(shown(ROZVAHA_AKTIVA, "mala")).toEqual([
      "",
      "A.",
      "B.",
      "B.I.",
      "B.II.",
      "B.III.",
      "C.",
      "C.I.",
      "C.II.",
      "C.II.1.",
      "C.II.2.",
      "C.II.3.",
      "C.III.",
      "C.IV.",
      "D.",
    ])
    expect(shown(ROZVAHA_PASIVA, "mala")).toEqual([
      "",
      "A.",
      "A.I.",
      "A.II.",
      "A.III.",
      "A.IV.",
      "A.V.",
      "A.VI.",
      "B.+C.",
      "B.",
      "C.",
      "C.I.",
      "C.II.",
      "C.III.",
      "D.",
    ])
  })

  it("zkrácený VZZ keeps the 26 římské / písmenné / výpočtové položky", () => {
    const mala = shown(VZZ, "mala")
    expect(mala).toHaveLength(26)
    expect(mala).toEqual(shown(VZZ, "mikro"))
    expect(mala).toContain("*")
    expect(mala).not.toContain("A.1.")
    expect(mala).not.toContain("D.2.1.")
  })

  it("plný rozsah shows every line", () => {
    for (const statement of STATEMENTS) {
      const all = statement.lines.filter((line) =>
        inRozsah(statement.id, line, "plny"),
      )
      expect(all).toHaveLength(statement.lines.length)
    }
  })
})
