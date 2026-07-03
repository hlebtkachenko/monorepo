/**
 * First-period bounds derivation (advisor change 3). Pure, UTC date math.
 *
 *   - NEW_ENTITY:      start = datum vzniku (short first period) OR first day of
 *                      the fiscal year; end = the fiscal-year end containing start.
 *   - MIGRATED_ENTITY: start = conversion date (periodStart); end = fiscal-year
 *                      end containing it.
 *   - TAX_RECORDS:     forced calendar year (daňová evidence, FO tax period is the
 *                      calendar year); fiscalYearStartMonth must be 1 (validated
 *                      by the orchestrator).
 *   - Explicit periodStart + periodEnd both given: used verbatim (§3/4 escape
 *     hatch for an up-to-15-month first period).
 */
import { ScaffoldValidationError } from "./errors"
import type { Regime } from "./regime"

export interface PeriodBoundsInput {
  entityKind: "NEW_ENTITY" | "MIGRATED_ENTITY"
  regime: Regime
  fiscalYearStartMonth: number
  registeredAt?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  fiscalYear?: number | null
}

export interface PeriodBounds {
  periodStart: string
  periodEnd: string
}

function pad2(n: number): string {
  return `${n}`.padStart(2, "0")
}

function lastDayBeforeNextFyStart(startISO: string, fysm: number): string {
  const [y, m] = startISO.split("-").map((s) => Number(s))
  // The fiscal year containing `start` began on the most recent (year, fysm, 1).
  const fyStartYear = (m as number) < fysm ? (y as number) - 1 : (y as number)
  // End = (fyStartYear + 1, fysm, 1) minus one day.
  const endExclusive = new Date(Date.UTC(fyStartYear + 1, fysm - 1, 1))
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1)
  return endExclusive.toISOString().slice(0, 10)
}

export function derivePeriodBounds(input: PeriodBoundsInput): PeriodBounds {
  // Escape hatch: both bounds explicit → verbatim.
  if (input.periodStart && input.periodEnd) {
    return { periodStart: input.periodStart, periodEnd: input.periodEnd }
  }

  const fysm = input.regime === "TAX_RECORDS" ? 1 : input.fiscalYearStartMonth

  let start: string | null
  if (input.entityKind === "MIGRATED_ENTITY") {
    start = input.periodStart ?? null
  } else {
    // NEW_ENTITY: datum vzniku if known, else first day of the chosen fiscal year.
    start = input.registeredAt ?? input.periodStart ?? null
    if (!start && input.fiscalYear) {
      start = `${input.fiscalYear}-${pad2(fysm)}-01`
    }
  }

  if (!start) {
    throw new ScaffoldValidationError(
      input.entityKind === "MIGRATED_ENTITY"
        ? "a migrated entity requires periodStart (conversion date)"
        : "a new entity requires registeredAt or fiscalYear to derive the first period",
      "MISSING_PERIOD_START",
    )
  }

  const end = input.periodEnd ?? lastDayBeforeNextFyStart(start, fysm)
  return { periodStart: start, periodEnd: end }
}
