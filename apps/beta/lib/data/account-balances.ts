import "server-only"

import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  account_balance_map,
  type BetaAccountKind,
  type BetaAccountMatchKind,
  type BetaPeriodKind,
} from "@/db/schema"

import { publishedBatchFor, publishedPeriodsForDataset } from "./imports"
import {
  accountBalanceMappingView,
  reportingPeriodView,
  type AccountBalanceMappingView,
  type ReportingPeriodView,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * Finance › Účty a hotovost (spec §2.4) — bank and cash balances, read off the
 * published obratová předvaha through `account_balance_map`.
 *
 * THE PORTAL COMPUTES NO BALANCE HERE, AND CANNOT. Every figure this module
 * returns is a `closing_balance` the office's own software printed into a
 * předvaha and published (`trial_balance_line`, migration 0007). What the SQL
 * below does is SELECT them, SUM the ones a prefix card covers, and SUM the
 * cards for the page total — presentation-level SQL over provided rows, which
 * spec §0.2 allows in so many words ("sums ... grouping"). There is no
 * arithmetic above the database and no money value is ever a JavaScript number.
 *
 * THE CURRENT BATCH ONLY, AND THE FILTER IS IN THE SQL. `status = 'published'`
 * is in the WHERE clause of the CTE, not applied by a caller: a draft is the
 * office staging a correction the client must not watch, and a superseded batch
 * is what the client saw BEFORE a correction. Reading either would put a number
 * on a client's screen that the office has already replaced — §0.4's
 * confidently-wrong data, produced by the one mechanism built to prevent it.
 *
 * WHAT A SPARKLINE IS ALLOWED TO BE (spec §2.4: "12-mo sparkline"). A published
 * closing balance per published period, and nothing else: no interpolation
 * across a period the office did not send, no carrying the previous period
 * forward, no zero-fill. A period whose předvaha does not carry the account at
 * all comes back with `closingBalance: null` and is DRAWN AS A GAP — the
 * §0.4 rule applied to a chart, where zero-filling is the exact lie ("the
 * account was empty") that looks most like data.
 *
 * THE PLOT COORDINATE IS COMPUTED IN SQL, NOT IN THE COMPONENT. Drawing a line
 * needs to know where a point sits between the series' own low and high — which
 * is a division, and money divided in JavaScript is money parsed into a double
 * (§0.7). So Postgres does it, on `numeric`, and hands out a plain `0..1`
 * ratio: a plot coordinate, not a figure anybody reads. The number the client
 * READS is still the verbatim `numeric(14,2)` string.
 *
 * READS ARE FOR EVERY ROLE, WRITES ARE OWNER-ONLY, the same split every module
 * behind this seam keeps: §5 makes guest an external viewer of client-visible
 * data and an account balance is client-visible; §3.3 puts the curation of the
 * map in Pro účetní › Zadávání dat, so every write below takes an `OwnerScope`
 * (which only `requireOwner` can mint) rather than a runtime role check.
 */

/**
 * How many published periods a sparkline may carry — spec §2.4's "12-mo".
 *
 * PERIODS, NOT MONTHS. The office may publish a předvaha quarterly or annually
 * (`reporting_period.period_kind`), and counting calendar months would then
 * either truncate a quarterly series to four points or reach three years back.
 * Twelve of whatever the office actually publishes is the honest reading of the
 * same instruction.
 */
const ACCOUNT_BALANCE_PERIODS = 12

/** One point of a card's sparkline: one published period's closing balance. */
export type AccountBalancePoint = {
  periodId: string
  period: ReportingPeriodView
  /**
   * `numeric(14,2)` as a string, exactly as the office's předvaha stated it.
   * NULL when that period's předvaha carries no matching účet — an absence, and
   * never a zero (§0.4).
   */
  closingBalance: string | null
  /** How many účty of that period's předvaha fed the figure (prefix cards). */
  matchedAccounts: number
  /**
   * Where the point sits between this series' own low and high, 0..1 — a PLOT
   * COORDINATE computed by Postgres, not a figure. Null twice over: when the
   * period states no balance, and when the series never moves at all (there is
   * no "between" on a flat line, and the renderer draws it down the middle).
   */
  plotRatio: number | null
}

/** One card of Účty a hotovost: a mapped account and what it holds. */
export type AccountBalanceCard = {
  id: string
  accountCode: string
  matchKind: BetaAccountMatchKind
  label: string
  kind: BetaAccountKind
  /** The CURRENT published period's closing balance, or null (§0.4). */
  closingBalance: string | null
  /** How many účty fed that figure. 0 = the current předvaha does not carry it. */
  matchedAccounts: number
  /** Oldest → newest, at most `ACCOUNT_BALANCE_PERIODS` points. */
  series: AccountBalancePoint[]
}

export type AccountBalancesReadModel = {
  /** The newest published předvaha period, or null — §0.4's honest absence. */
  period: ReportingPeriodView | null
  /** ISO instant the office published that předvaha. Null iff `period` is null. */
  publishedAt: string | null
  /** Active mappings only, in the office's own order. */
  cards: AccountBalanceCard[]
  /**
   * Spec §2.4's "celkem" — a SQL SUM over the cards' current balances. Null
   * when not one of them states a figure, which is an absence rather than
   * "0 Kč". The overlap trigger (migration 0014) is what makes this a sum over
   * disjoint sets rather than a double count.
   */
  total: string | null
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const MAPPING_COLUMNS = {
  id: account_balance_map.id,
  account_code: account_balance_map.account_code,
  match_kind: account_balance_map.match_kind,
  friendly_label: account_balance_map.friendly_label,
  kind: account_balance_map.kind,
  sort_order: account_balance_map.sort_order,
  active: account_balance_map.active,
  updated_at: account_balance_map.updated_at,
}

/** Deterministic card order: the office's own, then label, then code. */
const MAPPING_ORDER = [
  asc(account_balance_map.sort_order),
  asc(account_balance_map.friendly_label),
  asc(account_balance_map.account_code),
] as const

export type MappingFilter = {
  /**
   * Include retired entries. Default `false`.
   *
   * Zadávání dat asks for them (a retired account has to be findable again, and
   * re-activating it is the whole reason it was not deleted); nothing a client
   * reads does, because a retired account is not one of their accounts.
   */
  readonly includeInactive?: boolean
}

/**
 * The organization's account map. Every role may read it — the labels are the
 * client's own account names, and the balances they carry are client-visible.
 */
export async function accountMappingsForScope(
  scope: OrgScope,
  filter: MappingFilter = {},
): Promise<AccountBalanceMappingView[]> {
  const rows = await betaDb()
    .select(MAPPING_COLUMNS)
    .from(account_balance_map)
    .where(
      and(
        eq(account_balance_map.organization_id, scope.organizationId),
        filter.includeInactive
          ? undefined
          : eq(account_balance_map.active, true),
      ),
    )
    .orderBy(...MAPPING_ORDER)

  return rows.map(accountBalanceMappingView)
}

/**
 * The series query is raw SQL executed through `db.execute`, which returns the
 * driver's own values rather than Drizzle's column-mapped ones — so every
 * temporal column below is rendered to text BY POSTGRES (`::text` on the two
 * dates, which are already ISO), exactly as `lib/data/obligations.ts` does it.
 * The shape of the row is then a property of the query rather than of the
 * driver version. There is no instant in this row at all: the one this surface
 * stamps (`published_at`) comes off `publishedBatchFor`, which is a mapped
 * Drizzle read.
 */
type SeriesRow = {
  mapping_id: string
  period_id: string
  period_kind: BetaPeriodKind
  period_year: number
  period_month: number | null
  period_quarter: number | null
  period_starts_on: string
  period_ends_on: string
  closing_balance: string | null
  matched_accounts: string | number
  plot_ratio: number | null
  current_total: string | null
}

/**
 * Every active mapping's balance in every recently-published předvaha, with the
 * sparkline coordinate and the page total alongside.
 *
 * ONE QUERY, THREE ANSWERS, and they have to be one query because they are one
 * consistent read: the cards, their history and the total all have to describe
 * the SAME published batch. Three round trips could straddle a publish and put
 * a card's figure next to a total that no longer includes it.
 *
 * THE MATCH RULE IS THE `CASE` IN THE JOIN, and `starts_with` is deliberate
 * rather than `LIKE code || '%'`: `account_code` is free text (a Czech rozvrh
 * carries `343.01`, `221_02`, `311100`), and `_` / `%` are LIKE wildcards. A
 * mapping for `221_02` written as a LIKE pattern would silently also claim
 * `221502`. `starts_with` compares literally, so the account code means what it
 * says.
 */
function seriesQuery(organizationId: string, periods: number) {
  return sql<SeriesRow>`
    WITH published AS (
      -- The published předvahy, newest period first. The status filter is HERE
      -- rather than at a caller: a draft is the office's work in progress and a
      -- superseded batch is what the client saw before a correction.
      SELECT ib.id          AS batch_id,
             ib.period_id   AS period_id,
             rp.period_kind AS period_kind,
             rp.year        AS year,
             rp.month       AS month,
             rp.quarter     AS quarter,
             rp.starts_on   AS starts_on,
             rp.ends_on     AS ends_on
        FROM import_batch ib
        JOIN reporting_period rp
          ON rp.id = ib.period_id
         AND rp.organization_id = ib.organization_id
       WHERE ib.organization_id = ${organizationId}
         AND ib.dataset = 'predvaha'
         AND ib.status = 'published'
       ORDER BY rp.ends_on DESC
       LIMIT ${periods}
    ),
    matched AS (
      -- One row per (mapping, published period). A LEFT JOIN, so a period whose
      -- předvaha does not carry the account still produces a point — with a
      -- NULL balance, which the renderer draws as a gap rather than as a zero.
      SELECT m.id                  AS mapping_id,
             p.period_id           AS period_id,
             p.period_kind         AS period_kind,
             p.year                AS year,
             p.month               AS month,
             p.quarter             AS quarter,
             p.starts_on           AS starts_on,
             p.ends_on             AS ends_on,
             SUM(l.closing_balance) AS closing_balance,
             COUNT(l.id)            AS matched_accounts
        FROM account_balance_map m
        CROSS JOIN published p
        LEFT JOIN trial_balance_line l
          ON l.organization_id = m.organization_id
         AND l.import_batch_id = p.batch_id
         AND (
           CASE
             WHEN m.match_kind = 'prefix'
               THEN starts_with(l.account_code, m.account_code)
             ELSE l.account_code = m.account_code
           END
         )
       WHERE m.organization_id = ${organizationId}
         AND m.active
       GROUP BY m.id, p.period_id, p.period_kind, p.year, p.month, p.quarter,
                p.starts_on, p.ends_on
    ),
    plotted AS (
      SELECT s.*,
             -- The plot coordinate, computed in numeric: where this point sits
             -- between the series' own low and high. NULLIF makes a series that
             -- never moves divide by NULL rather than by zero, and the renderer
             -- draws that flat line down the middle.
             (
               (s.closing_balance - MIN(s.closing_balance) OVER w)
               / NULLIF(
                   MAX(s.closing_balance) OVER w - MIN(s.closing_balance) OVER w,
                   0
                 )
             )::double precision AS plot_ratio,
             ROW_NUMBER() OVER (
               PARTITION BY s.mapping_id ORDER BY s.ends_on DESC
             ) AS recency
        FROM matched s
      WINDOW w AS (PARTITION BY s.mapping_id)
    )
    SELECT
      p.mapping_id,
      p.period_id,
      p.period_kind::text  AS period_kind,
      p.year               AS period_year,
      p.month              AS period_month,
      p.quarter            AS period_quarter,
      p.starts_on::text    AS period_starts_on,
      p.ends_on::text      AS period_ends_on,
      p.closing_balance,
      p.matched_accounts,
      p.plot_ratio,
      -- Spec §2.4's "celkem", computed once over exactly the newest period's
      -- rows. The same value rides on every row; the caller reads it off one.
      SUM(p.closing_balance) FILTER (WHERE p.recency = 1) OVER () AS current_total
    FROM plotted p
    ORDER BY p.mapping_id, p.ends_on ASC
  `
}

/**
 * Účty a hotovost's whole read model.
 *
 * The header stamp comes from the import spine's OWN reads
 * (`publishedPeriodsForDataset` / `publishedBatchFor`) rather than from the
 * series query, so a book that has published a předvaha but mapped no account
 * yet — and a book that has mapped accounts but published nothing — both still
 * say WHEN they were last fed. Those two states are the ones §0.4 is about, and
 * a stamp derived from the series would be missing from exactly them.
 */
export async function accountBalancesForScope(
  scope: OrgScope,
): Promise<AccountBalancesReadModel> {
  const [mappings, periods, rows] = await Promise.all([
    accountMappingsForScope(scope),
    publishedPeriodsForDataset(scope, "predvaha"),
    betaDb().execute(
      seriesQuery(scope.organizationId, ACCOUNT_BALANCE_PERIODS),
    ) as unknown as Promise<SeriesRow[]>,
  ])

  const period = periods[0] ?? null
  const batch = period
    ? await publishedBatchFor(scope, {
        periodId: period.id,
        dataset: "predvaha",
      })
    : null

  const seriesByMapping = new Map<string, AccountBalancePoint[]>()
  for (const row of rows) {
    const points = seriesByMapping.get(row.mapping_id) ?? []
    points.push({
      periodId: row.period_id,
      period: reportingPeriodView({
        id: row.period_id,
        period_kind: row.period_kind,
        year: row.period_year,
        month: row.period_month,
        quarter: row.period_quarter,
        starts_on: row.period_starts_on,
        ends_on: row.period_ends_on,
      }),
      closingBalance: row.closing_balance,
      // `COUNT(*)` is a bigint, which the driver hands back as a string.
      // `Number()` on a row count is not money arithmetic (§0.7 is about
      // `numeric(14,2)`), and a předvaha has hundreds of účty, not 2^53.
      matchedAccounts: Number(row.matched_accounts),
      plotRatio: row.plot_ratio,
    })
    seriesByMapping.set(row.mapping_id, points)
  }

  const cards = mappings.map((mapping) => {
    const series = seriesByMapping.get(mapping.id) ?? []
    // The series is ordered oldest → newest by the query, so the current period
    // is its last point. Absent entirely when nothing is published.
    const current = series.at(-1) ?? null
    return {
      id: mapping.id,
      accountCode: mapping.accountCode,
      matchKind: mapping.matchKind,
      label: mapping.label,
      kind: mapping.kind,
      closingBalance: current?.closingBalance ?? null,
      matchedAccounts: current?.matchedAccounts ?? 0,
      series,
    }
  })

  return {
    period,
    publishedAt: batch?.publishedAt ?? null,
    cards,
    // The window function is per-row, so with no rows there is nothing to read
    // it off — and "no mapped account states a balance" is an absence, which
    // §0.4 says renders as such rather than as a zero.
    total: rows[0]?.current_total ?? null,
  }
}

// ---------------------------------------------------------------------------
// Office writes — Zadávání dat (spec §3.3) and the ingestion API (§3.2)
// ---------------------------------------------------------------------------

/**
 * What the office (or its agent) may state about one account.
 *
 * `accountCode` IS THE IDENTITY and is absent from the patch type below for the
 * same reason `FilingPatch` omits `kind`: re-pointing an entry at a different
 * účet would silently rewrite every historical card built from it, including
 * periods the client has already read. A mis-typed code is deleted and
 * re-entered — which costs nothing, because the entry holds no data of its own.
 */
export type AccountMappingWriteInput = {
  readonly accountCode: string
  readonly matchKind?: BetaAccountMatchKind
  readonly label: string
  readonly kind: BetaAccountKind
  readonly sortOrder?: number
  readonly active?: boolean
}

/** Everything except the account code — see `AccountMappingWriteInput`. */
export type AccountMappingPatch = Partial<
  Omit<AccountMappingWriteInput, "accountCode">
>

/**
 * The entry for this account code, or null — the ingestion API's upsert lookup,
 * the twin of `liabilityIdByExternalRef`.
 *
 * Matched on the account code rather than on an `external_ref`, because the
 * code is the natural key: it is what the office's own rozvrh calls the row,
 * it is unique within the book (migration 0014), and a second match key would
 * let one re-sent entry match one key while colliding on the other.
 */
export async function accountMappingIdByCode(
  owner: OwnerScope,
  accountCode: string,
  executor: BetaExecutor = betaDb(),
): Promise<string | null> {
  const [row] = await executor
    .select({ id: account_balance_map.id })
    .from(account_balance_map)
    .where(
      and(
        eq(account_balance_map.organization_id, owner.organizationId),
        eq(account_balance_map.account_code, accountCode),
      ),
    )
    .limit(1)

  return row?.id ?? null
}

export async function createAccountMapping(
  owner: OwnerScope,
  input: AccountMappingWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  const [row] = await executor
    .insert(account_balance_map)
    .values({
      organization_id: owner.organizationId,
      account_code: input.accountCode,
      ...(input.matchKind ? { match_kind: input.matchKind } : {}),
      friendly_label: input.label,
      kind: input.kind,
      ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
      ...(input.active === undefined ? {} : { active: input.active }),
    })
    .returning({ id: account_balance_map.id })

  if (!row) throw new Error("account_balance_map insert returned no row")
  return row
}

/**
 * Edit an entry. Returns whether a row matched, so the caller can refuse rather
 * than report a successful save of nothing.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary key:
 * without it an id leaked or guessed from anywhere would let a holder of ANY
 * scope re-label ANY organization's account, and this database has no RLS
 * behind the seam to catch it.
 */
export async function updateAccountMapping(
  owner: OwnerScope,
  mappingId: string,
  patch: AccountMappingPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const values = {
    ...("matchKind" in patch ? { match_kind: patch.matchKind } : {}),
    ...("label" in patch ? { friendly_label: patch.label } : {}),
    ...("kind" in patch ? { kind: patch.kind } : {}),
    ...("sortOrder" in patch ? { sort_order: patch.sortOrder } : {}),
    ...("active" in patch ? { active: patch.active } : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await executor
    .update(account_balance_map)
    .set(values)
    .where(
      and(
        eq(account_balance_map.id, mappingId),
        eq(account_balance_map.organization_id, owner.organizationId),
      ),
    )
    .returning({ id: account_balance_map.id })

  return updated.length > 0
}

/**
 * Delete entries by id, within the scope's own organization.
 *
 * A HARD delete, and it is safe here in a way it would not be on an accounting
 * row: this table holds no accounting fact, only a name for one. What a delete
 * costs is HISTORY — the account drops out of every past card too — which is
 * why `active = false` exists and is what the UI offers for a closed account.
 */
export async function deleteAccountMappings(
  owner: OwnerScope,
  mappingIds: readonly string[],
): Promise<number> {
  if (mappingIds.length === 0) return 0

  const deleted = await betaDb()
    .delete(account_balance_map)
    .where(
      and(
        eq(account_balance_map.organization_id, owner.organizationId),
        inArray(account_balance_map.id, [...mappingIds]),
      ),
    )
    .returning({ id: account_balance_map.id })

  return deleted.length
}
