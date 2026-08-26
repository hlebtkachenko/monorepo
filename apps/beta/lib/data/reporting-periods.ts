import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { reporting_period, type BetaPeriodKind } from "@/db/schema"

import { reportingPeriodView, type ReportingPeriodView } from "./projections"
import { assertOwner, type OrgScope } from "./scope"

/**
 * Reporting periods — the identity every stamped dataset in this product points
 * at (spec §4: "every import/stamp references period_id").
 *
 * Follows the seam shape `organizations.ts` documents: the first parameter is an
 * `OrgScope` the caller cannot invent, the WHERE clause filters on
 * `scope.organizationId` and never on a request value, and the return value is a
 * projection.
 *
 * WHY THERE IS NO `deleteReportingPeriod`. `filing_period_fk` is ON DELETE
 * RESTRICT, so a period that anything has been stamped with cannot be removed
 * anyway — and an unreferenced one costs nothing. Periods accumulate; they are
 * not curated.
 */

const PERIOD_COLUMNS = {
  id: reporting_period.id,
  period_kind: reporting_period.period_kind,
  year: reporting_period.year,
  month: reporting_period.month,
  quarter: reporting_period.quarter,
  starts_on: reporting_period.starts_on,
  ends_on: reporting_period.ends_on,
}

/**
 * The organization's periods, newest first.
 *
 * Ordered by `ends_on DESC` rather than by (year, month): that is the one
 * ordering that interleaves the three shapes correctly, which a period PICKER
 * has to do — 2026, Q4 2026 and 12/2026 all end on the same day and a
 * year-then-month sort would scatter them.
 */
export async function reportingPeriodsForScope(
  scope: OrgScope,
  options: { kind?: BetaPeriodKind } = {},
): Promise<ReportingPeriodView[]> {
  const rows = await betaDb()
    .select(PERIOD_COLUMNS)
    .from(reporting_period)
    .where(
      and(
        eq(reporting_period.organization_id, scope.organizationId),
        options.kind
          ? eq(reporting_period.period_kind, options.kind)
          : undefined,
      ),
    )
    .orderBy(desc(reporting_period.ends_on), asc(reporting_period.period_kind))

  return rows.map(reportingPeriodView)
}

/**
 * The identity of a period, as a caller states it. Exactly one of `month` /
 * `quarter` is meaningful, per `kind`; the database's `reporting_period_shape`
 * CHECK is the floor under that and `normalizePeriodInput` below is the ceiling.
 */
export type ReportingPeriodInput = {
  readonly kind: BetaPeriodKind
  readonly year: number
  readonly month?: number | null
  readonly quarter?: number | null
}

/**
 * Drop the coordinate that does not belong to `kind`, so a caller that carries
 * both (a form that remembers the last month while the user switches to
 * "quarter") cannot write a row the CHECK would reject — or, worse, one that
 * satisfies it while carrying a stale month nobody meant.
 */
function normalizePeriodInput(input: ReportingPeriodInput): {
  period_kind: BetaPeriodKind
  year: number
  month: number | null
  quarter: number | null
} {
  return {
    period_kind: input.kind,
    year: input.year,
    month: input.kind === "month" ? (input.month ?? null) : null,
    quarter: input.kind === "quarter" ? (input.quarter ?? null) : null,
  }
}

/**
 * Get the period, creating it if this organization does not have it yet.
 *
 * OFFICE WRITE (spec §3.3: "Zadávání dat — the ONLY editing home for
 * non-document data"). Client pages are read-only for every role, so this is
 * `assertOwner`-gated like every other write in this app.
 *
 * ONE STATEMENT, NOT SELECT-THEN-INSERT. `ON CONFLICT DO NOTHING` plus a
 * `RETURNING` fallback read is what makes it safe under concurrency: two
 * accountants filing the same month at the same moment both get the same row
 * instead of one of them getting a duplicate-key 500. The conflict target is the
 * identity constraint, which is `NULLS NOT DISTINCT` — without that, two
 * `(org, 'year', 2026, NULL, NULL)` rows would both insert and neither would
 * conflict.
 */
export async function ensureReportingPeriod(
  scope: OrgScope,
  input: ReportingPeriodInput,
): Promise<ReportingPeriodView> {
  assertOwner(scope)

  const values = normalizePeriodInput(input)

  const [inserted] = await betaDb()
    .insert(reporting_period)
    .values({ organization_id: scope.organizationId, ...values })
    .onConflictDoNothing({
      target: [
        reporting_period.organization_id,
        reporting_period.period_kind,
        reporting_period.year,
        reporting_period.month,
        reporting_period.quarter,
      ],
    })
    .returning(PERIOD_COLUMNS)

  if (inserted) return reportingPeriodView(inserted)

  const [existing] = await betaDb()
    .select(PERIOD_COLUMNS)
    .from(reporting_period)
    .where(
      and(
        eq(reporting_period.organization_id, scope.organizationId),
        eq(reporting_period.period_kind, values.period_kind),
        eq(reporting_period.year, values.year),
        // `IS NOT DISTINCT FROM`, not `=`: for a year period both coordinates
        // are NULL and `= NULL` matches nothing, so an `eq` here would turn the
        // conflict fallback into a "row vanished" error on every year period.
        sql`${reporting_period.month} IS NOT DISTINCT FROM ${values.month}`,
        sql`${reporting_period.quarter} IS NOT DISTINCT FROM ${values.quarter}`,
      ),
    )
    .limit(1)

  if (!existing) {
    // Unreachable: the insert either wrote the row or lost the race to a row
    // that is still there — nothing deletes periods (see the module header).
    throw new Error("reporting period neither inserted nor found")
  }

  return reportingPeriodView(existing)
}
