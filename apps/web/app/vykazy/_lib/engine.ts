// Pure calculation engine for the Výkazy builder. No React, no I/O — safe to
// import from server or client. Given a VykazStatement + a ColKey + the leaf
// VykazValues, it computes the value of EVERY line in that column, resolving
// calc formulas topologically (memoized recursion) and throwing on a cycle.

import type { ColKey, VykazLine, VykazStatement, VykazValues } from "./types"

/** A single signed reference inside a formula, e.g. "+005" -> { sign: 1, rada: "005" }. */
interface FormulaTerm {
  sign: number
  rada: string
}

/**
 * Parse a signed-sum formula ("004+005+006", "049-050", "-050+060") into terms.
 * Whitespace is tolerated. The first term defaults to a positive sign.
 */
function parseFormula(formula: string): FormulaTerm[] {
  const terms: FormulaTerm[] = []
  const re = /([+-]?)\s*([^+\-\s]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(formula)) !== null) {
    const rada = match[2]
    if (rada === undefined) continue
    terms.push({ sign: match[1] === "-" ? -1 : 1, rada })
  }
  return terms
}

/**
 * Compute every line's value in one column.
 *
 *  - leaf  (kind="input"): the entered number, or 0 when absent.
 *  - calc  (kind="calc"):  the signed sum of the referenced lines' values in
 *                          THIS column; an unknown reference contributes 0.
 *  - netto column:         ALWAYS derived, ignoring formulas —
 *                          netto(line) = brutto(line) + korekce(line).
 *  - korekce cell flagged  korekceNA contributes 0 (the paper form prints "x").
 *
 * Throws on a formula cycle.
 */
export function computeColumn(
  statement: VykazStatement,
  col: ColKey,
  values: VykazValues,
): Record<string, number> {
  // Derived netto column: brutto + korekce for every line, formulas ignored.
  if (col === "netto") {
    const brutto = computeColumn(statement, "brutto", values)
    const korekce = computeColumn(statement, "korekce", values)
    const out: Record<string, number> = {}
    for (const line of statement.lines) {
      out[line.rada] = (brutto[line.rada] ?? 0) + (korekce[line.rada] ?? 0)
    }
    return out
  }

  const byRada = new Map<string, VykazLine>()
  for (const line of statement.lines) byRada.set(line.rada, line)

  const memo = new Map<string, number>()
  const stack = new Set<string>()

  const leafValue = (line: VykazLine): number => {
    if (col === "korekce" && line.korekceNA) return 0
    const v = values[line.rada]?.[col]
    return typeof v === "number" && Number.isFinite(v) ? v : 0
  }

  const resolve = (rada: string): number => {
    const cached = memo.get(rada)
    if (cached !== undefined) return cached

    const line = byRada.get(rada)
    if (!line) return 0 // unknown reference -> 0

    if (line.kind === "input") {
      const v = leafValue(line)
      memo.set(rada, v)
      return v
    }

    // Explicit override: a calc line may carry a directly supplied value in
    // `values` — used when importing a minulé-období statement that is only
    // known at reporting (aggregate) level (e.g. a zkrácený rozvaha), where the
    // plný-rozsah leaves are not available. The supplied value wins over the
    // formula. Never triggers for the deník/manual paths, which write leaves
    // only. The derived netto column is handled above and is unaffected.
    const override = values[rada]?.[col]
    if (typeof override === "number" && Number.isFinite(override)) {
      memo.set(rada, override)
      return override
    }

    if (stack.has(rada)) {
      throw new Error(
        `Cycle detected in výkaz "${statement.id}" at řádek ${rada} (sloupec ${col})`,
      )
    }

    stack.add(rada)
    let sum = 0
    if (line.formula) {
      for (const term of parseFormula(line.formula)) {
        sum += term.sign * resolve(term.rada)
      }
    }
    stack.delete(rada)
    memo.set(rada, sum)
    return sum
  }

  const out: Record<string, number> = {}
  for (const line of statement.lines) out[line.rada] = resolve(line.rada)
  return out
}

/** Compute every line's value across every column of the statement. */
export function computeAll(
  statement: VykazStatement,
  values: VykazValues,
): Record<string, Partial<Record<ColKey, number>>> {
  const out: Record<string, Partial<Record<ColKey, number>>> = {}
  for (const col of statement.columns) {
    const colValues = computeColumn(statement, col, values)
    for (const line of statement.lines) {
      const row = out[line.rada] ?? (out[line.rada] = {})
      row[col] = colValues[line.rada]
    }
  }
  return out
}
