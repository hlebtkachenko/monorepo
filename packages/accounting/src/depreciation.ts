/**
 * Daňové odpisy (tax depreciation) — Act 586/1992 Sb. (ZDP) §26–§32. Distinct
 * from ÚČETNÍ odpisy (the depreciation_plan drives those, posted MD 551 / D 08x
 * by supporting.ts). Only the DAŇOVÝ odpis is tax-deductible (§24/2a); the
 * difference (účetní − daňový) is a §23/3 adjustment to the DPPO base — this
 * module computes the tax schedule and that difference so it can feed buildDppo.
 *
 * Odpisové skupiny (§30, příloha č.1 ZDP) — minimum useful life:
 *   1 → 3 let · 2 → 5 · 3 → 10 · 4 → 20 · 5 → 30 · 6 → 50
 *
 * Methods:
 *   §31 rovnoměrné (straight-line) — roční odpisová sazba %: first year lower,
 *       following years higher; odpis = cost × sazba / 100.
 *   §32 zrychlené (accelerated) — koeficient k: year 1 = cost / k1; following
 *       years = 2 × zůstatková cena / (k − n), n = years already depreciated.
 *
 * The schedule is a TAX reference computation (not a ledger posting — účetní
 * odpisy are what hit the books), so it is computed here in TS and rounded to
 * whole Kč up (§26/3 ZDP — daňový odpis se zaokrouhluje na celé koruny nahoru); the amount that
 * ENTERS the DPPO base is summed in SQL by buildDppo (R13).
 */

import type { Decimal } from "./types"

export type DepreciationGroup = 1 | 2 | 3 | 4 | 5 | 6
export type TaxDepreciationMethod = "STRAIGHT_LINE" | "ACCELERATED"

/** §31 roční odpisová sazba (%) — [first year, following years] per group. */
const STRAIGHT_LINE_RATE: Record<DepreciationGroup, [number, number]> = {
  1: [20, 40],
  2: [11, 22.25],
  3: [5.5, 10.5],
  4: [2.15, 5.15],
  5: [1.4, 3.4],
  6: [1.02, 2.02],
}

/** §32 koeficient — [first year, following years] per group. */
const ACCELERATED_COEFF: Record<DepreciationGroup, [number, number]> = {
  1: [3, 4],
  2: [5, 6],
  3: [10, 11],
  4: [20, 21],
  5: [30, 31],
  6: [50, 51],
}

/** Minimum useful life (years) per group (§30). */
export const GROUP_LIFE_YEARS: Record<DepreciationGroup, number> = {
  1: 3,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 50,
}

function roundUpKc(n: number): string {
  return Math.ceil(n).toFixed(2)
}

/**
 * §31 straight-line tax depreciation for one year of an asset's life.
 * yearIndex is 1-based (1 = first year).
 */
export function straightLineTaxDepreciation(
  cost: Decimal,
  group: DepreciationGroup,
  yearIndex: number,
): Decimal {
  const [first, next] = STRAIGHT_LINE_RATE[group]
  const rate = yearIndex <= 1 ? first : next
  const life = GROUP_LIFE_YEARS[group]
  if (yearIndex > life) return "0.00"
  return roundUpKc((Number(cost) * rate) / 100)
}

/**
 * §32 accelerated tax depreciation for one year. Needs the accumulated
 * depreciation BEFORE this year (0 in year 1). yearIndex is 1-based.
 */
export function acceleratedTaxDepreciation(
  cost: Decimal,
  group: DepreciationGroup,
  yearIndex: number,
  accumulatedBefore: Decimal,
): Decimal {
  const [k1, kn] = ACCELERATED_COEFF[group]
  const life = GROUP_LIFE_YEARS[group]
  if (yearIndex > life) return "0.00"
  if (yearIndex <= 1) return roundUpKc(Number(cost) / k1)
  const residual = Number(cost) - Number(accumulatedBefore)
  const n = yearIndex - 1 // years already depreciated
  return roundUpKc((2 * residual) / (kn - n))
}

/**
 * The full straight-line or accelerated schedule (year → odpis + accumulated),
 * for a proof / to precompute the depreciation_plan.
 */
export function taxDepreciationSchedule(
  cost: Decimal,
  group: DepreciationGroup,
  method: TaxDepreciationMethod,
): { year: number; depreciation: Decimal; accumulated: Decimal }[] {
  const out: { year: number; depreciation: Decimal; accumulated: Decimal }[] =
    []
  let accumulated = 0
  for (let y = 1; y <= GROUP_LIFE_YEARS[group]; y++) {
    const dep =
      method === "STRAIGHT_LINE"
        ? straightLineTaxDepreciation(cost, group, y)
        : acceleratedTaxDepreciation(cost, group, y, accumulated.toFixed(2))
    // last year: absorb the rounding remainder so Σ = cost exactly
    let depNum = Number(dep)
    if (y === GROUP_LIFE_YEARS[group]) depNum = Number(cost) - accumulated
    accumulated += depNum
    out.push({
      year: y,
      depreciation: depNum.toFixed(2),
      accumulated: accumulated.toFixed(2),
    })
  }
  return out
}

/**
 * §23/3 adjustment for DPPO: účetní odpis (in the P&L) is replaced by the daňový
 * odpis. Returns the amount to ADD BACK to the base (positive = účetní > daňový,
 * the excess book depreciation is not deductible) or DEDUCT (negative). Feed the
 * positive part to buildDppo `nonDeductibleExpenses`, the negative to a deduction.
 */
export function bookVsTaxAdjustment(
  bookDepreciation: Decimal,
  taxDepreciation: Decimal,
): { addBack: Decimal; deduct: Decimal } {
  const diff = Number(bookDepreciation) - Number(taxDepreciation)
  return diff >= 0
    ? { addBack: diff.toFixed(2), deduct: "0.00" }
    : { addBack: "0.00", deduct: (-diff).toFixed(2) }
}
