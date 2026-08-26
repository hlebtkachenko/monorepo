import "server-only"

import type { BetaImportDataset } from "@/db/schema"
import { IMPORT_DATASETS, officeBatchHistoryFor } from "@/lib/data/imports"
import type {
  OfficeImportBatchRow,
  ReportingPeriodView,
} from "@/lib/data/projections"
import { reportingPeriodsForScope } from "@/lib/data/reporting-periods"
import type { OwnerScope } from "@/lib/data/scope"

/**
 * The completeness matrix and the batch history of one period (spec §3.2), in
 * one read.
 *
 * BOTH VIEWS ARE THE SAME QUERY. "Which datasets are in for 07/2026" and "what
 * has been imported for 07/2026" are the same rows grouped two ways, so they
 * are fetched once — and, more importantly, they cannot disagree. A matrix
 * built from one read and a history built from another would eventually show a
 * dataset as published whose only batch the history shows as a draft, which is
 * the single most misleading thing this surface could do.
 *
 * ONE CELL PER DECLARED DATASET, ALWAYS — built from `IMPORT_DATASETS`, not
 * from the query, exactly as `datasetFreshnessForScope` does. A dataset with no
 * payload table yet (`saldokonto`, `payroll`) has to appear as ABSENT rather
 * than be missing from the grid: §0.4's whole point is that the office sees
 * gaps before the client does, and "we have not built this feed" and "the
 * office has not sent this month" are different gaps. PR 18's Dluhy a platby
 * set that precedent for unimplemented sources; this follows it.
 */
export type DatasetCell = {
  readonly dataset: BetaImportDataset
  /** False until the dataset has a payload table — see `IMPORT_DATASETS`. */
  readonly implemented: boolean
  /** The live batch for this (period, dataset), or null. At most one. */
  readonly published: OfficeImportBatchRow | null
  /** The newest unpublished draft, if the office has one staged. */
  readonly draft: OfficeImportBatchRow | null
  /** Every batch ever imported for this (period, dataset), newest first. */
  readonly batches: readonly OfficeImportBatchRow[]
}

export type UzaverkaView = {
  /** Every period this organization knows about, newest first. */
  readonly periods: readonly ReportingPeriodView[]
  /** The period under review, or null when the organization has none yet. */
  readonly period: ReportingPeriodView | null
  readonly cells: readonly DatasetCell[]
}

export async function loadUzaverka(
  owner: OwnerScope,
  requestedPeriodId: string | undefined,
): Promise<UzaverkaView> {
  const periods = await reportingPeriodsForScope(owner)
  const period =
    (requestedPeriodId === undefined
      ? undefined
      : periods.find((candidate) => candidate.id === requestedPeriodId)) ??
    periods[0] ??
    null

  if (!period) {
    return { periods, period: null, cells: emptyCells() }
  }

  const batches = await officeBatchHistoryFor(owner, { periodId: period.id })

  return {
    periods,
    period,
    cells: IMPORT_DATASETS.map(({ dataset, implemented }) => {
      const own = batches.filter((batch) => batch.dataset === dataset)
      return {
        dataset,
        implemented,
        published: own.find((batch) => batch.status === "published") ?? null,
        // Newest first from the query, so `find` IS the newest draft.
        draft: own.find((batch) => batch.status === "draft") ?? null,
        batches: own,
      }
    }),
  }
}

/** The grid an organization with no periods at all still renders. */
function emptyCells(): DatasetCell[] {
  return IMPORT_DATASETS.map(({ dataset, implemented }) => ({
    dataset,
    implemented,
    published: null,
    draft: null,
    batches: [],
  }))
}
