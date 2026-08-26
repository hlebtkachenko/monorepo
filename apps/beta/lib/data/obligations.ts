import "server-only"

import { sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import type {
  BetaFilingKind,
  BetaObligationGroup,
  BetaPeriodKind,
} from "@/db/schema"

import { reportingPeriodView, type ReportingPeriodView } from "./projections"
import type { OrgScope } from "./scope"

/**
 * Finance › Dluhy a platby — the DERIVED obligations read model (spec §2.4).
 *
 * THE POINT OF THIS MODULE IS THAT THERE IS NO TABLE. Spec §2.4 is emphatic:
 * "derived obligations read-model, NOT typed rows (kills triple entry)". An
 * unpaid filing is already a row in `filing`; a supplier payable is already a
 * row in the imported saldokonto; typing either of them a second time into a
 * `debt` table would give the office three places to keep in step and the client
 * three numbers that disagree. So this file reads the sources and shapes them,
 * and owns nothing.
 *
 * THREE SOURCES, ONE IMPLEMENTED (spec §2.4):
 *
 *   filing            unpaid filings with a positive amount_due     — HERE, now
 *   partner_saldo     payables per partner, from the saldokonto     — PR 28
 *   manual_liability  the residue the other two cannot see          — PR 18
 *
 * WHY A QUERY BUILDER AND NOT A DATABASE VIEW. A view would have to be replaced
 * by a migration twice more as the other two sources land, and — the deciding
 * reason — a view has to decide its own tenancy. There is no RLS in this
 * database (plan Part 4): what keeps one client's book out of another's page is
 * the `OrgScope` in the WHERE clause of the query that reads it. A view cannot
 * take a scope, so a view would either be unfiltered (and the filter would move
 * back out to every caller, which is the seam being bypassed) or would bake in a
 * GUC this database does not set. The union lives here, in the one place that
 * already holds the scope.
 *
 * ADDING A SOURCE (PR 18 / PR 28) is meant to be a small, local change: register
 * it in `OBLIGATION_SOURCES` with `implemented: true`, add one arm to the
 * `UNION ALL` in `obligationRowsQuery` selecting the same column list, and add
 * one arm to the freshness query. `Obligation` does not change shape, so no
 * consumer does either — which is the whole reason `source` is a discriminator
 * on every row rather than something the caller infers.
 */

export type ObligationSource = "filing" | "partner_saldo" | "manual_liability"

/**
 * The sources, in the order §2.4 groups them, and whether each one exists yet.
 *
 * `implemented: false` is not a placeholder — spec §0.3 forbids those. It is the
 * fact a surface needs in order to render an absent source as ABSENT rather than
 * as "0 Kč", which is the difference between an honest empty state and a
 * confidently wrong one.
 */
export const OBLIGATION_SOURCES: readonly {
  readonly source: ObligationSource
  readonly implemented: boolean
}[] = Object.freeze([
  { source: "filing", implemented: true },
  { source: "partner_saldo", implemented: false },
  { source: "manual_liability", implemented: false },
])

/** One outstanding obligation, whichever source produced it. */
export type Obligation = {
  /**
   * Unique across the whole union — `${source}:${sourceId}`. Two sources can
   * legitimately hold the same uuid (they are different tables), so a bare id
   * would collide as a React key the day the second source lands.
   */
  key: string
  source: ObligationSource
  /** Who is owed: FÚ / ČSSZ a ZP / Dodavatelé / Ostatní (§2.4). */
  group: BetaObligationGroup
  /**
   * The filing kind, for a filing-sourced row; null for every other source. The
   * UI turns it into a Czech title — this layer ships NO display strings, so the
   * read model stays translatable and testable.
   */
  filingKind: BetaFilingKind | null
  /**
   * Free-text title carried by sources that have one (a partner name, a manual
   * liability's label). Null when the title is derived from `filingKind`.
   */
  label: string | null
  /** The period this obligation belongs to, when its source is period-stamped. */
  period: ReportingPeriodView | null
  /** `numeric(14,2)` as a string. Always strictly positive — see the WHERE clause. */
  amount: string
  /** Splatnost. */
  dueOn: string
  variableSymbol: string | null
  /** Derived in SQL against CURRENT_DATE (§2.4: "Po splatnosti derived"). */
  overdue: boolean
  daysOverdue: number
  /** The SOURCE's own last edit — the §2.4 per-group stamp. */
  asOf: string
}

/**
 * Per-source freshness (spec §0.4: every surface stamps its own dataset, and
 * "empty beats stale").
 *
 * `sourceUpdatedAt` is the last time the office touched the SOURCE, not the last
 * time it produced an obligation. The difference is the whole point: an
 * organization whose filings are all paid has zero obligations and a recent
 * stamp, and the surface can say "k <date> nic neevidujeme" instead of going
 * silent and looking unmaintained.
 */
export type ObligationSourceFreshness = {
  source: ObligationSource
  implemented: boolean
  /** ISO timestamp of the newest row in the source, or null when it holds none. */
  sourceUpdatedAt: string | null
  /** How many OPEN obligations this source contributes right now. */
  openCount: number
}

export type ObligationsReadModel = {
  obligations: Obligation[]
  freshness: ObligationSourceFreshness[]
  /** SQL-computed sums, as strings. Spec §0.2: no arithmetic above the database. */
  totals: {
    total: string
    overdue: string
  }
}

const ZERO = "0.00"

/**
 * Render a timestamptz as an ISO 8601 instant, in SQL.
 *
 * The union below is raw SQL executed through `db.execute`, which returns the
 * driver's own values rather than Drizzle's column-mapped ones — so a
 * `timestamptz` arrives as whatever the driver decided, not as the `Date` a
 * mapped column would give. Rather than guess at that per driver version, every
 * temporal column in these two queries is rendered to a string BY POSTGRES:
 * `::text` for dates (already ISO) and this for instants. The shape of the row
 * is then a property of the query, not of the driver.
 */
const ISO_INSTANT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`

type ObligationRow = {
  source: ObligationSource
  source_id: string
  group: BetaObligationGroup
  filing_kind: BetaFilingKind | null
  label: string | null
  amount: string
  due_on: string
  variable_symbol: string | null
  overdue: boolean
  days_overdue: number
  as_of: string
  period_id: string | null
  period_kind: BetaPeriodKind | null
  period_year: number | null
  period_month: number | null
  period_quarter: number | null
  period_starts_on: string | null
  period_ends_on: string | null
  total_all: string
  total_overdue: string
}

/**
 * The union.
 *
 * Raw SQL rather than the query builder, because a `UNION ALL` of
 * differently-shaped sources reads as what it is here and does not in Drizzle's
 * combinator form — and because the next two arms are meant to be appended by
 * someone reading the first one. The only interpolated value is the scope's own
 * organization id, which `postgres` parameterizes.
 *
 * The totals ride along as window functions rather than a second round trip.
 * `SUM(...) OVER ()` is computed once per query, in the database, over exactly
 * the rows being returned — which is the §0.2 rule ("presentation-level SQL over
 * provided rows ... allowed") satisfied without ever holding a money value in
 * JavaScript arithmetic.
 */
function obligationRowsQuery(organizationId: string) {
  return sql<ObligationRow>`
    WITH obligation AS (
      -- SOURCE 1/3: unpaid filings (spec §2.4, groups FÚ / ČSSZ a ZP).
      --
      -- amount_due > 0 is three exclusions in one predicate: NULL (the office
      -- has not stated an amount — not a debt, an unknown), 0 (a nil filing —
      -- filed, nothing owed) and negative (a nadměrný odpočet — the FÚ owes the
      -- client, which is not a debt of theirs and must never be listed as one).
      SELECT
        'filing'::text                              AS source,
        f.id                                        AS source_id,
        beta_filing_obligation_group(f.kind)::text  AS "group",
        f.kind::text                                AS filing_kind,
        NULL::text                                  AS label,
        f.amount_due                                AS amount,
        f.due_on                                    AS due_on,
        f.variable_symbol                           AS variable_symbol,
        to_char(f.updated_at AT TIME ZONE 'UTC',
                ${sql.raw(ISO_INSTANT)})            AS as_of,
        p.id                                        AS period_id,
        p.period_kind::text                         AS period_kind,
        p.year                                      AS period_year,
        p.month                                     AS period_month,
        p.quarter                                   AS period_quarter,
        p.starts_on::text                           AS period_starts_on,
        p.ends_on::text                             AS period_ends_on
      FROM filing f
      JOIN reporting_period p
        ON p.id = f.period_id
       AND p.organization_id = f.organization_id
      WHERE f.organization_id = ${organizationId}
        AND f.paid_at IS NULL
        AND f.amount_due > 0

      -- SOURCE 2/3 (PR 28): partner_saldo payables, group 'dodavatele'.
      -- SOURCE 3/3 (PR 18): manual liability residue, group 'ostatni'.
      -- Each arrives as one more UNION ALL SELECT with this column list.
    )
    SELECT
      o.source, o.source_id, o."group", o.filing_kind, o.label, o.amount,
      o.due_on::text                                   AS due_on,
      o.variable_symbol, o.as_of, o.period_id, o.period_kind, o.period_year,
      o.period_month, o.period_quarter, o.period_starts_on, o.period_ends_on,
      (o.due_on < CURRENT_DATE)                        AS overdue,
      GREATEST(CURRENT_DATE - o.due_on, 0)             AS days_overdue,
      SUM(o.amount) OVER ()                            AS total_all,
      COALESCE(
        SUM(o.amount) FILTER (WHERE o.due_on < CURRENT_DATE) OVER (),
        0
      )                                                AS total_overdue
    FROM obligation o
    ORDER BY o.due_on ASC, o.source ASC, o.source_id ASC
  `
}

type FreshnessRow = {
  source: ObligationSource
  source_updated_at: string | null
}

function freshnessQuery(organizationId: string) {
  return sql<FreshnessRow>`
    -- The SOURCE's own stamp (§2.4), independent of whether it currently owes
    -- anything. See the note on ObligationSourceFreshness.
    SELECT
      'filing'::text AS source,
      to_char(max(f.updated_at) AT TIME ZONE 'UTC',
              ${sql.raw(ISO_INSTANT)}) AS source_updated_at
      FROM filing f
     WHERE f.organization_id = ${organizationId}
    -- PR 28 / PR 18 append their own arm here.
  `
}

/**
 * Read the obligations of `scope`'s organization.
 *
 * Every role may call this: §5 makes guest an external viewer of the same
 * client-visible data, and Dluhy a platby is client-visible. What a guest may
 * not do is CHANGE any of the three sources, and none of them is writable from
 * here.
 */
export async function obligationsForScope(
  scope: OrgScope,
): Promise<ObligationsReadModel> {
  const db = betaDb()

  const [rows, freshnessRows] = await Promise.all([
    db.execute(obligationRowsQuery(scope.organizationId)),
    db.execute(freshnessQuery(scope.organizationId)),
  ])

  const obligations = (rows as unknown as ObligationRow[]).map(toObligation)
  const first = (rows as unknown as ObligationRow[])[0]

  const stampBySource = new Map(
    (freshnessRows as unknown as FreshnessRow[]).map((row) => [
      row.source,
      row.source_updated_at,
    ]),
  )
  const openCountBySource = new Map<ObligationSource, number>()
  for (const obligation of obligations) {
    openCountBySource.set(
      obligation.source,
      (openCountBySource.get(obligation.source) ?? 0) + 1,
    )
  }

  return {
    obligations,
    // Built from the constant, not from the query: a source with no rows at all
    // still has to appear, or the surface cannot tell "nothing outstanding"
    // apart from "this source does not exist yet".
    freshness: OBLIGATION_SOURCES.map(({ source, implemented }) => ({
      source,
      implemented,
      sourceUpdatedAt: stampBySource.get(source) ?? null,
      openCount: openCountBySource.get(source) ?? 0,
    })),
    // The window functions are per-row, so with zero rows there is no row to
    // read them off. `"0.00"` is a constant, not arithmetic.
    totals: {
      total: first?.total_all ?? ZERO,
      overdue: first?.total_overdue ?? ZERO,
    },
  }
}

function toObligation(row: ObligationRow): Obligation {
  return {
    key: `${row.source}:${row.source_id}`,
    source: row.source,
    group: row.group,
    filingKind: row.filing_kind,
    label: row.label,
    period:
      row.period_id === null
        ? null
        : reportingPeriodView({
            id: row.period_id,
            period_kind: row.period_kind as BetaPeriodKind,
            year: row.period_year as number,
            month: row.period_month,
            quarter: row.period_quarter,
            starts_on: row.period_starts_on as string,
            ends_on: row.period_ends_on as string,
          }),
    amount: row.amount,
    dueOn: row.due_on,
    variableSymbol: row.variable_symbol,
    overdue: row.overdue,
    daysOverdue: Number(row.days_overdue),
    asOf: row.as_of,
  }
}
