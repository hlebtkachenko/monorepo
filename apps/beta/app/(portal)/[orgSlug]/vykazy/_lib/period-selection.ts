import type { ReportingPeriodView } from "@/lib/data/projections"

/**
 * Which period a Výkazy page is showing, and how far behind the office is —
 * the two calendar questions §0.4's freshness contract turns on.
 *
 * PURE, AND CALENDAR-ONLY. Nothing here touches a money value. `periodsBehind`
 * is a comparison of two dates on a calendar, not a derivation of an accounting
 * fact: it decides whether to show a sentence, never what a number is.
 */

/** The query-string key the period picker writes. */
export const PERIOD_PARAM = "obdobi"

/**
 * The period to render, out of the ones that HAVE a published batch.
 *
 * The requested id is validated against the published list rather than trusted
 * — a period id in a URL is request input, and one belonging to another
 * organization (or to a period this dataset has nothing for) must resolve to
 * the ordinary default rather than to an empty page that looks like a data gap.
 * The list is already newest-first (`publishedPeriodsForDataset`), so the
 * default is simply its head.
 *
 * `null` means the dataset has no published period at all, which §0.4 says the
 * page renders as "zatím nebylo nahráno".
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

/**
 * A period's position on a timeline of its OWN kind, so two of them can be
 * subtracted.
 *
 * Months, quarters and years live on three different timelines and are not
 * comparable across kinds — 12/2026 and 2026 both end on 31.12., and "one
 * period later" means a different thing on each. Hence `periodsBehind` below
 * refuses a mixed pair outright instead of producing a number that would look
 * like an answer.
 */
function ordinal(period: ReportingPeriodView): number | null {
  switch (period.kind) {
    case "month":
      return period.month === null ? null : period.year * 12 + period.month
    case "quarter":
      return period.quarter === null ? null : period.year * 4 + period.quarter
    case "year":
      return period.year
  }
}

/**
 * How many periods the newest PUBLISHED one is behind the newest the
 * organization KNOWS ABOUT — spec §0.4's warning band ("Poslední údaje k
 * <date> — novější zatím nebyly nahrány").
 *
 * WHAT "KNOWS ABOUT" MEANS, and why it is the honest comparison. `reporting_
 * period` rows are created by every dated thing in this product — a filing
 * entered for 07/2026 creates 07/2026 — so the organization's newest period of
 * a kind is evidence that the office is already working in that period. A
 * dataset still published only up to 05/2026 is then genuinely stale, and the
 * client is entitled to be told so on the page rather than to infer it from a
 * date stamp.
 *
 * IT IS NOT "TODAY". A month's rozvaha is published weeks after that month
 * ends, so comparing against the wall clock would put a permanent warning band
 * on a perfectly current book — the surface would cry wolf every month and the
 * band would stop meaning anything.
 *
 * Returns `null` when the two periods are of different kinds, when either
 * coordinate is missing, or when there is nothing to compare — all of which the
 * caller renders as no band, because an uncomparable pair is not evidence of
 * staleness.
 */
export function periodsBehind(
  published: ReportingPeriodView | null,
  latestKnown: ReportingPeriodView | null,
): number | null {
  if (!published || !latestKnown) return null
  if (published.kind !== latestKnown.kind) return null

  const from = ordinal(published)
  const to = ordinal(latestKnown)
  if (from === null || to === null) return null

  const behind = to - from
  return behind > 0 ? behind : null
}

/**
 * The §0.4 band fires only when the gap is MORE THAN ONE period.
 *
 * One period behind is the normal state of a monthly close — 07/2026's rozvaha
 * does not exist while 07/2026 is still being booked. Two is the office having
 * missed a month, which is what the client needs to be told.
 */
export function isStale(behind: number | null): boolean {
  return behind !== null && behind > 1
}
