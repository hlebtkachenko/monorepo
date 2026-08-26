import type { ReportingPeriodView } from "@/lib/data/projections"

/**
 * Which period Přehled mezd is showing — the same small, pure question
 * `vykazy/_lib/period-selection.ts` answers for its three statements, kept as
 * its own copy here rather than a shared import: Mzdy has its own gated period
 * list (`publishedPayrollPeriods`, narrowed by `payrollScope`), so the two
 * modules' period pickers are not the same read wearing two labels — they only
 * happen to share this one small selection rule.
 */

/** The query-string key the period picker writes. */
export const PERIOD_PARAM = "obdobi"

/**
 * The period to render, out of the ones that HAVE a published payroll batch.
 *
 * The requested id is validated against the published list rather than
 * trusted — a period id in a URL is request input, and one belonging to
 * another organization (or to a period payroll has nothing for) must resolve
 * to the ordinary default rather than to an empty page that looks like a data
 * gap. The list is already newest-first, so the default is simply its head.
 */
export function selectPeriod(
  periods: readonly ReportingPeriodView[],
  requested: string | undefined,
): ReportingPeriodView | null {
  if (requested !== undefined) {
    const match = periods.find((period) => period.id === requested)
    if (match) return match
  }
  return periods[0] ?? null
}
