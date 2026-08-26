import "server-only"

import { sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { betaObligationGroup } from "@/db/schema"
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
 * THREE SOURCES, TWO IMPLEMENTED (spec §2.4):
 *
 *   filing            unpaid filings with a positive amount_due     — PR 16
 *   partner_saldo     payables per partner, from the saldokonto     — PR 28
 *   manual_liability  the residue the other two cannot see          — HERE, now
 *
 * THE UNION IS DISJOINT BY CONSTRUCTION, WHICH IS THE ANTI-TRIPLE-ENTRY RULE.
 * §2.4 writes the sources with their creditor groups in parentheses — "filings
 * (FÚ / ČSSZ a ZP) ∪ partner_saldo payables (Dodavatelé) ∪ manual liability
 * residue (Ostatní)" — and that is a partition, not a coincidence: Advisor
 * defect F11 found liabilities being typed three times over, and a union that
 * could show the same debt twice would have rebuilt the defect one layer up.
 * Two fences make it structural rather than conventional, and both live in
 * migration 0006:
 *
 *   1. `liability_group_is_residue` refuses `dodavatele` outright — that group
 *      belongs wholly to the imported saldokonto.
 *   2. A liability CANNOT NAME A FILING. There is no `filing_id` column, so a
 *      filing's money is only ever read off the filing row. "The same debt from
 *      two sources" is not a state this query has to detect; it is a state the
 *      schema cannot express — which is why there is no dedup pass below and
 *      must never be one. A fuzzy match on (group, due date, amount) would
 *      silently hide a real second debt, and hiding a debt is the worse error.
 *
 * `fu` and `cssz_zp` stay open to the manual source for the residue that
 * genuinely lives there — penále, úrok z prodlení, a splátkový kalendář — none
 * of which is a form with a statutory deadline, so none of which has a filing
 * row to duplicate. See the migration header for that judgement in full.
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
 * ADDING A SOURCE (PR 28) is meant to be a small, local change: register it in
 * `OBLIGATION_SOURCES` with `implemented: true`, add one arm to the `UNION ALL`
 * in `obligationRowsQuery` selecting the same column list, and add one arm to
 * the freshness query. `Obligation` does not change shape, so no consumer does
 * either — which is the whole reason `source` is a discriminator on every row
 * rather than something the caller infers. PR 18 followed that contract to the
 * letter and this note is the evidence it holds.
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
  { source: "manual_liability", implemented: true },
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

/**
 * One creditor group as Dluhy a platby renders it (spec §2.4: "groups FÚ / ČSSZ
 * a ZP ... Dodavatelé ... Ostatní").
 *
 * ONLY NON-EMPTY GROUPS ARE RETURNED. Spec §0.4's "empty beats stale" cuts both
 * ways: a group with nothing in it must not render as a heading over "0 Kč",
 * because that reads as a measured zero rather than as an absence. A page with
 * no groups at all renders the empty state, which says something true.
 *
 * `total` / `overdue` are SQL window sums over exactly this group's rows —
 * `SUM(...) OVER (PARTITION BY "group")`, computed once inside the same query
 * that returns the rows. No money value is ever added in JavaScript (§0.2).
 *
 * `asOf` is the §2.4 per-group stamp: "the SOURCE's own stamp (filing edit /
 * import period / manual edit)". A group can be fed by more than one source —
 * `ostatni` takes both a filing of kind `ostatni` and every manual liability —
 * so it is the LATEST of the stamps its rows carry. Picking the latest of a set
 * of timestamps is not accounting arithmetic; it is which of two dates to print.
 */
export type ObligationGroupSummary = {
  group: BetaObligationGroup
  /** Never empty. Ordered by deadline, soonest first. */
  obligations: Obligation[]
  /** SQL window sum over this group. `numeric(14,2)` as a string. */
  total: string
  /** The overdue subset of the same sum. */
  overdue: string
  /** How many of the rows are past their deadline. A row count, not money. */
  overdueCount: number
  /** ISO instant — the newest source stamp among this group's rows. */
  asOf: string
}

export type ObligationsReadModel = {
  obligations: Obligation[]
  /**
   * The same obligations, bucketed by creditor group in enum order and never
   * carrying an empty bucket. This is what the page renders; `obligations` is
   * the flat list the unified Nejbližší termíny of §2.1 (PR 20) reads.
   */
  groups: ObligationGroupSummary[]
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
  group_total: string
  group_overdue: string
}

/**
 * The union itself, as a composable SQL fragment: every row of money this
 * organization currently owes, whichever source states it.
 *
 * Raw SQL rather than the query builder, because a `UNION ALL` of
 * differently-shaped sources reads as what it is here and does not in Drizzle's
 * combinator form — and because the next arm is meant to be appended by someone
 * reading the first one. The only interpolated value is the scope's own
 * organization id, which `postgres` parameterizes.
 *
 * EXPORTED SO THE UNION HAS EXACTLY ONE DEFINITION. `lib/data/deadlines.ts` —
 * §2.1's unified Nejbližší termíny — needs these same rows under a different
 * ordering, next to two sources that are not obligations at all. Re-typing the
 * two arms there would put the anti-triple-entry rules (`amount_due > 0`
 * excluding a nadměrný odpočet; a liability that cannot name a filing) in two
 * places, and the day PR 28 appends the partner_saldo arm it would land in only
 * one of them. A caller wraps this in its own CTE and names its own columns:
 *
 *     WITH obligation AS (${obligationUnionSql(organizationId)}) SELECT ...
 *
 * The COLUMN LIST IS THE CONTRACT — source, source_id, "group", filing_kind,
 * label, amount, due_on, variable_symbol, as_of, and the seven period columns,
 * in that order. Both consumers select by name, so an arm added below has to
 * produce all of them (which the `UNION ALL` enforces anyway) and neither
 * consumer changes.
 */
export function obligationUnionSql(organizationId: string) {
  return sql`
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
      -- It arrives as one more UNION ALL SELECT with this column list.

      UNION ALL

      -- SOURCE 3/3: the manual liability residue (spec §2.4, §4 "liability
      -- (residual manual only)") — what neither the filing registry nor the
      -- imported saldokonto can express.
      --
      -- NO "amount > 0" PREDICATE HERE, and the asymmetry with the filing arm
      -- above is deliberate rather than an omission. filing.amount_due is
      -- nullable and sign-carrying, so that arm has to exclude three different
      -- non-debts in its WHERE clause. liability.amount is NOT NULL with
      -- CHECK (amount > 0) (migration 0006) — money owed TO this company is a
      -- receivable, not a negative debt — so the same predicate here would be a
      -- filter that can never remove a row, and stating a rule twice is how the
      -- two copies eventually disagree.
      --
      -- Every period column is NULL: a manual liability is not stamped with a
      -- reporting period (§2.4's row shape is titul / věřitel / částka /
      -- splatnost / VS, with no period), which is exactly why Obligation.period
      -- has been nullable since the union shipped with one arm. The casts are
      -- not decoration — a bare NULL in the second arm of a UNION takes its type
      -- from the first, and period_kind would arrive as beta_period_kind rather
      -- than the text the row type expects.
      SELECT
        'manual_liability'::text                    AS source,
        l.id                                        AS source_id,
        l.creditor_group::text                      AS "group",
        NULL::text                                  AS filing_kind,
        l.label                                     AS label,
        l.amount                                    AS amount,
        l.due_on                                    AS due_on,
        l.variable_symbol                           AS variable_symbol,
        to_char(l.updated_at AT TIME ZONE 'UTC',
                ${sql.raw(ISO_INSTANT)})            AS as_of,
        NULL::uuid                                  AS period_id,
        NULL::text                                  AS period_kind,
        NULL::smallint                              AS period_year,
        NULL::smallint                              AS period_month,
        NULL::smallint                              AS period_quarter,
        NULL::text                                  AS period_starts_on,
        NULL::text                                  AS period_ends_on
      FROM liability l
      WHERE l.organization_id = ${organizationId}
        AND l.paid_at IS NULL
  `
}

/**
 * Dluhy a platby's own read of the union: every row, plus the §2.4 totals.
 *
 * The totals ride along as window functions rather than a second round trip.
 * `SUM(...) OVER ()` is computed once per query, in the database, over exactly
 * the rows being returned — which is the §0.2 rule ("presentation-level SQL over
 * provided rows ... allowed") satisfied without ever holding a money value in
 * JavaScript arithmetic.
 */
function obligationRowsQuery(organizationId: string) {
  return sql<ObligationRow>`
    WITH obligation AS (${obligationUnionSql(organizationId)})
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
      )                                                AS total_overdue,
      -- The §2.4 per-group totals, partitioned by creditor group. Same rule as
      -- the two above: the sum is computed once, by Postgres, over exactly the
      -- rows being returned — never by adding strings in JavaScript.
      SUM(o.amount) OVER (PARTITION BY o."group")      AS group_total,
      COALESCE(
        SUM(o.amount) FILTER (WHERE o.due_on < CURRENT_DATE)
          OVER (PARTITION BY o."group"),
        0
      )                                                AS group_overdue
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

    UNION ALL

    -- The manual source's own stamp, on the same terms: when the office last
    -- touched a liability, whether or not any of them is still outstanding.
    SELECT
      'manual_liability'::text AS source,
      to_char(max(l.updated_at) AT TIME ZONE 'UTC',
              ${sql.raw(ISO_INSTANT)}) AS source_updated_at
      FROM liability l
     WHERE l.organization_id = ${organizationId}
    -- PR 28 appends its own arm here.
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

  const obligationRows = rows as unknown as ObligationRow[]
  const obligations = obligationRows.map(toObligation)
  const first = obligationRows[0]

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
    groups: groupObligations(obligationRows, obligations),
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

/**
 * Bucket the flat, deadline-ordered list into the §2.4 creditor groups.
 *
 * TAKES BOTH THE RAW ROWS AND THE PROJECTED ONES, and that is not clumsiness:
 * the per-group sums are window values that live on the RAW row (`group_total`,
 * `group_overdue`) and are deliberately absent from `Obligation` — the union's
 * row shape is frozen by contract, and a projected row carrying its own group's
 * total would also be a projected row that means something different depending
 * on which query produced it. The two arrays are the same query's output in the
 * same order, so index `i` of one is index `i` of the other.
 *
 * GROUPS COME OUT IN ENUM ORDER, not in first-seen order. First-seen order is a
 * function of which deadline happens to be soonest, so the FÚ block would move
 * up and down the page between visits with nothing having changed. The enum's
 * order is §2.4's own (FÚ, ČSSZ a ZP, Dodavatelé, Ostatní).
 */
function groupObligations(
  rows: readonly ObligationRow[],
  obligations: readonly Obligation[],
): ObligationGroupSummary[] {
  const byGroup = new Map<BetaObligationGroup, ObligationGroupSummary>()

  for (const [index, row] of rows.entries()) {
    const obligation = obligations[index]
    if (!obligation) continue

    const existing = byGroup.get(row.group)
    if (existing) {
      existing.obligations.push(obligation)
      existing.overdueCount += obligation.overdue ? 1 : 0
      // The stamp of the group is the latest of its rows' source stamps. Every
      // `as_of` is rendered by Postgres in the same fixed-width UTC ISO 8601
      // form (`ISO_INSTANT`), so ordering them as strings orders them as
      // instants — no Date parsing, no timezone to get wrong.
      if (obligation.asOf > existing.asOf) existing.asOf = obligation.asOf
      continue
    }

    byGroup.set(row.group, {
      group: row.group,
      obligations: [obligation],
      total: row.group_total,
      overdue: row.group_overdue,
      overdueCount: obligation.overdue ? 1 : 0,
      asOf: obligation.asOf,
    })
  }

  return OBLIGATION_GROUP_ORDER.map((group) => byGroup.get(group)).filter(
    (summary): summary is ObligationGroupSummary => summary !== undefined,
  )
}

/**
 * §2.4's own group order, read off the pgEnum rather than re-typed — a fifth
 * creditor group added to `beta_obligation_group` renders without anyone having
 * to remember this line exists.
 */
const OBLIGATION_GROUP_ORDER: readonly BetaObligationGroup[] =
  betaObligationGroup.enumValues

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
