// A calc line may carry an explicit value instead of evaluating its formula.
// Two things put one there: clicking an `overridable` cell (ř. 56 Čistý obrat,
// where § 35 vyhlášky makes the formula only a default), and a prior-year import
// that supplies aggregates rather than leaves (a zkrácený rozvaha has no plný
// -rozsah leaves to import).
//
// Both are deliberate. What was not deliberate is the value then rendering as an
// ordinary computed total with no way to clear it, so these guard the engine
// behaviour and the predicate the table uses to decide a cell is editable.

import { describe, expect, it } from "vitest"

import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { computeColumn } from "./engine"
import type { VykazLine, VykazValues } from "./types"

/** The table's rule: a calc line holding an explicit value is editable. */
function isOverridden(
  line: VykazLine,
  values: VykazValues,
  col: "bezne" | "minule",
): boolean {
  return line.kind === "calc" && values[line.rada]?.[col] !== undefined
}

const byRada = (statement: { lines: VykazLine[] }, rada: string): VykazLine => {
  const line = statement.lines.find((l) => l.rada === rada)
  if (!line) throw new Error(`no ř. ${rada}`)
  return line
}

describe("explicit value on a calc line", () => {
  it("wins over the formula, and its absence hands the formula back", () => {
    const withValue: VykazValues = {
      "001": { bezne: 100 },
      "056": { bezne: 7 },
    }
    expect(computeColumn(VZZ, "bezne", withValue)["056"]).toBe(7)

    const withoutValue: VykazValues = { "001": { bezne: 100 } }
    expect(computeColumn(VZZ, "bezne", withoutValue)["056"]).toBe(100)
  })

  it("is editable in the table, so it can be seen and cleared", () => {
    const cisty = byRada(VZZ, "056")
    expect(cisty.overridable).toBe(true)
    expect(isOverridden(cisty, { "056": { minule: 36 } }, "minule")).toBe(true)
    expect(isOverridden(cisty, {}, "minule")).toBe(false)
  })

  it("is editable on a NON-overridable calc too — a prior-year import can put a value on any aggregate", () => {
    const pasiva = rozvahaPasiva("D")
    const cizi = byRada(pasiva, "023") // B.+C. Cizí zdroje, a plain subtotal
    expect(cizi.kind).toBe("calc")
    expect(cizi.overridable).toBeUndefined()

    const imported: VykazValues = { "023": { minule: 5526 } }
    expect(computeColumn(pasiva, "minule", imported)["023"]).toBe(5526)
    expect(isOverridden(cizi, imported, "minule")).toBe(true)
  })

  it("never reaches the netto column — netto stays brutto + korekce", () => {
    // The engine short-circuits netto before the override check, so a supplied
    // netto is ignored rather than silently breaking AKTIVA = PASIVA.
    const aktiva = rozvahaAktiva("D")
    const values: VykazValues = {
      "018": { brutto: 1000, korekce: -400, netto: 999999 },
    }
    expect(computeColumn(aktiva, "netto", values)["018"]).toBe(600)
  })
})

describe("čistý obrat, ř. 56", () => {
  it("defaults to I. + II. only, not to the sum of every výnos", () => {
    // § 1d odst. 2 ZoÚ. The MF tiskopis still prints the pre-2024 footnote
    // I.+II.+III.+IV.+V.+VI.+VII., which would give 36 here instead of 0.
    const noSales: VykazValues = {
      "001": { minule: 0 },
      "002": { minule: 0 },
      "046": { minule: 36 }, // VII. Ostatní finanční výnosy
    }
    expect(computeColumn(VZZ, "minule", noSales)["056"]).toBe(0)
  })

  it("carries a per-line hint rather than a hardcoded one in the table", () => {
    expect(byRada(VZZ, "056").overridableHint).toContain("§ 35")
    const others = VZZ.lines.filter((l) => l.rada !== "056")
    expect(others.every((l) => l.overridable === undefined)).toBe(true)
  })
})
