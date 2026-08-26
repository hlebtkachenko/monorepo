import type { ReportingPeriodView } from "@/lib/data/projections"

/**
 * `07/2026`, `Q3 2026` or `2026` depending on `period.kind`.
 *
 * `ReportingPeriodView`'s own doc comment names this as deliberately absent
 * from the data layer ("that formatting is i18n's job … a Czech string built
 * [in the data layer] would be untranslatable and untestable") and points at
 * PR 17 as the first surface that needs one — this is that function.
 *
 * `month` / `quarter` are read only in the branch that owns them:
 * `reporting_period_shape` (migration 0005) guarantees the other coordinate
 * is NULL for a given `kind`, so there is no third branch to get wrong.
 */
export function formatReportingPeriodLabel(
  period: ReportingPeriodView,
): string {
  switch (period.kind) {
    case "month":
      return `${String(period.month).padStart(2, "0")}/${period.year}`
    case "quarter":
      return `Q${period.quarter} ${period.year}`
    case "year":
      return String(period.year)
  }
}
