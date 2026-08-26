import type { ReportingPeriodView } from "@/lib/data/projections"

/**
 * The §0.4 freshness band — "empty beats stale", stated as three states rather
 * than as a boolean (Advisor F24: "freshness per DATASET + completeness matrix
 * + warning bands").
 *
 * §0.4 gives the rule in one sentence: "When a dataset's newest published
 * period lags the org's current reporting period by more than one period, the
 * surface shows a warning band". Three things in that sentence decide this
 * module's shape:
 *
 *   - "lags ... BY MORE THAN ONE PERIOD" — one period of slack is normal, not
 *     late. The office publishes July during August; a dataset whose newest
 *     period is the one just ended is exactly on time. Two periods behind is
 *     the first state worth a warning.
 *   - "the org's CURRENT REPORTING PERIOD" — there is no stored fiscal calendar
 *     in this database, and `reporting_period` rows exist only where a dataset
 *     was actually stamped. So the current period is derived from TODAY, in the
 *     dataset's own period kind: a monthly dataset is compared in months, a
 *     yearly one in years. Comparing a `year` period in months would put every
 *     annual dataset eleven periods behind on the second of January.
 *   - "a dataset's NEWEST PUBLISHED period" — a dataset with none is `absent`,
 *     not `lagging`. Those are different facts and the surface says different
 *     things about them ("zatím nenahráno" vs "novější zatím nebyly nahrány").
 *
 * PURE, and deliberately so: no `server-only`, no React, no database. A Client
 * Component renders a band without a provider, and `today` is a parameter
 * rather than a `new Date()` inside, so the boundary cases are tests instead of
 * a comment about what would happen at a month end.
 */

export type FreshnessBand =
  /** The office has never published this dataset. */
  | "absent"
  /** Newest period is this period or the one just ended. */
  | "current"
  /** Two or more periods behind — §0.4's warning band. */
  | "lagging"

/**
 * How many of the period's OWN units have elapsed since it ended.
 *
 * 0 = the period we are inside, 1 = the one just ended, and so on. Negative for
 * a period that has not started yet (an office may publish a period ahead of
 * time), which reads as fresher than current and is treated as such.
 *
 * `endsOn` is NOT used. It is the same fact expressed as a day, and reaching
 * for it would introduce day arithmetic where index arithmetic on the period's
 * own coordinates is exact: `07/2026` and `2026-07-31` are the same period, and
 * only one of them can be compared to today without a calendar.
 */
export function periodsSincePeriod(
  period: Pick<ReportingPeriodView, "kind" | "year" | "month" | "quarter">,
  today: string,
): number {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))

  switch (period.kind) {
    case "month":
      // `month` is NOT NULL for a monthly period (`reporting_period_shape`,
      // migration 0005) — the `?? 1` is the DSL's nullable type, not a case.
      return year * 12 + month - (period.year * 12 + (period.month ?? 1))
    case "quarter":
      return (
        year * 4 +
        Math.ceil(month / 3) -
        (period.year * 4 + (period.quarter ?? 1))
      )
    case "year":
      return year - period.year
  }
}

/**
 * The band a surface renders for one dataset.
 *
 * `null` — no published period at all — is `absent`. Everything within one
 * period of today is `current`; anything older is `lagging`.
 */
export function freshnessBand(
  period: Pick<
    ReportingPeriodView,
    "kind" | "year" | "month" | "quarter"
  > | null,
  today: string,
): FreshnessBand {
  if (period === null) return "absent"
  return periodsSincePeriod(period, today) > 1 ? "lagging" : "current"
}
