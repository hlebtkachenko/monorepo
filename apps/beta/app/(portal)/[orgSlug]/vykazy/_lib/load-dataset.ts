import "server-only"

import type { BetaImportDataset } from "@/db/schema"
import {
  publishedBatchFor,
  publishedPeriodsForDataset,
} from "@/lib/data/imports"
import type {
  ImportBatchView,
  ReportingPeriodView,
} from "@/lib/data/projections"
import { reportingPeriodsForScope } from "@/lib/data/reporting-periods"
import type { OrgScope } from "@/lib/data/scope"

import { periodsBehind, selectPeriod } from "./period-selection"

/**
 * The three reads every Výkazy page makes, in one place.
 *
 * All three statements ask the import spine the SAME questions and differ only
 * by dataset: which periods are published, which batch is the published one for
 * the period being viewed, and how far behind that period is. Writing it once
 * means the freshness contract (§0.4) is implemented once — the alternative is
 * three pages that each decide independently what to do when a dataset has
 * never been fed, which is exactly how one of them ends up rendering zeroes.
 *
 * IT NEVER RETURNS ROWS. The payload read differs per statement kind
 * (`statementLinesForBatch` twice for a rozvaha, `trialBalanceLinesForBatch`
 * for a předvaha) and belongs to the page that knows which shape it is
 * rendering. This resolves the batch; the page reads what is in it.
 */
export type DatasetView = {
  /** Periods with a published batch, newest first. The picker's whole content. */
  readonly periods: readonly ReportingPeriodView[]
  /** The period being viewed, or null when nothing has ever been published. */
  readonly period: ReportingPeriodView | null
  /** The published batch for that period. Null iff `period` is null. */
  readonly batch: ImportBatchView | null
  /**
   * How many periods the NEWEST published one lags the newest period this
   * organization knows about (spec §0.4). Null when there is nothing to
   * compare — see `periodsBehind`.
   */
  readonly behind: number | null
}

export async function loadDataset(
  scope: OrgScope,
  dataset: BetaImportDataset,
  requestedPeriodId: string | undefined,
): Promise<DatasetView> {
  const periods = await publishedPeriodsForDataset(scope, dataset)
  const period = selectPeriod(periods, requestedPeriodId)

  if (!period) {
    return { periods, period: null, batch: null, behind: null }
  }

  // The lag is measured against the NEWEST published period, not against the
  // one being viewed: deliberately opening 03/2026 is not a staleness signal,
  // and a band that fired on it would be telling the reader off for navigating.
  const newestPublished = periods[0] ?? null
  const [batch, knownPeriods] = await Promise.all([
    publishedBatchFor(scope, { periodId: period.id, dataset }),
    newestPublished
      ? reportingPeriodsForScope(scope, { kind: newestPublished.kind })
      : Promise.resolve([]),
  ])

  return {
    periods,
    period,
    batch,
    behind: periodsBehind(newestPublished, knownPeriods[0] ?? null),
  }
}
