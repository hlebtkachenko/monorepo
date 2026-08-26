import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  asset,
  asset_event,
  type BetaAssetCategory,
  type BetaAssetEventKind,
  type BetaAssetStatus,
} from "@/db/schema"

import {
  assetEventView,
  assetView,
  type AssetEventView,
  type AssetView,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * Majetek — the asset register and its event history (spec §2.7).
 *
 * SHALLOW BY DESIGN (spec depth map: "Majetek ... table + stamp suffices").
 * This module is deliberately smaller than `filings.ts`: one filter, one
 * derived column, four writes.
 *
 * READS ARE FOR EVERY ROLE, same as filing (spec §5: guest is an external
 * VIEWER of client-visible data, not a blinded one) — every read below takes
 * a plain `OrgScope`.
 *
 * WRITES ARE OWNER-ONLY (spec §3.3: client pages are read-only for every
 * role). Every write below takes an `OwnerScope`, not an `OrgScope` — the
 * same brand `lib/data/documents-office.ts` (PR 14) established: "owner only"
 * is a PARAMETER TYPE, so a caller cannot reach one of these with a member's
 * or a guest's handle even by mistake. The caller mints it with
 * `requireOwner(await requireScope(orgSlug))` as its first statement — see
 * `app/(portal)/[orgSlug]/majetek/_actions/assets.ts`.
 *
 * NO ARITHMETIC ABOVE THE DATABASE (spec §0.2). `residualValue` —
 * `acquisition_cost − accumulated_depreciation` — is computed by
 * `RESIDUAL_VALUE`, in SQL, and the Přehled majetku footer SUM is computed by
 * `SUM(...) OVER ()`, also in SQL. Neither is depreciation math: both are
 * presentation-level SQL over rows the office already provided, which §0.2
 * names as the one arithmetic this product is allowed to do.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `acquisition_cost − accumulated_depreciation`, or NULL when the office has
 * not provided the oprávky figure yet — never a silent zero (spec §0.4).
 */
const RESIDUAL_VALUE = sql<string | null>`
  CASE WHEN ${asset.accumulated_depreciation} IS NULL THEN NULL
       ELSE (${asset.acquisition_cost} - ${asset.accumulated_depreciation})
  END
`

/** The Přehled majetku footer SUM, over exactly the rows the WHERE clause kept. */
const TOTAL_ACQUISITION_COST = sql<string>`SUM(${asset.acquisition_cost}) OVER ()`
const TOTAL_RESIDUAL_VALUE = sql<string | null>`
  SUM(${RESIDUAL_VALUE}) OVER ()
`

const ASSET_COLUMNS = {
  id: asset.id,
  name: asset.name,
  category: asset.category,
  is_minor: asset.is_minor,
  acquisition_cost: asset.acquisition_cost,
  acquired_on: asset.acquired_on,
  placed_in_service_on: asset.placed_in_service_on,
  accumulated_depreciation: asset.accumulated_depreciation,
  depreciation_as_of: asset.depreciation_as_of,
  tax_residual_value: asset.tax_residual_value,
  site_ref: asset.site_ref,
  status: asset.status,
  disposed_on: asset.disposed_on,
  note_client: asset.note_client,
  updated_at: asset.updated_at,
  residualValue: RESIDUAL_VALUE,
}

const ZERO = "0.00"

export type AssetFilter = {
  readonly status?: BetaAssetStatus
}

export type AssetListResult = {
  assets: AssetView[]
  /** SQL-computed sums over the filtered rows, as strings (spec §0.2). */
  totals: {
    acquisitionCost: string
    residualValue: string
  }
}

/** Přehled majetku, alphabetical by name (spec §2.7 has no other stated order). */
export async function assetsForScope(
  scope: OrgScope,
  filter: AssetFilter = {},
): Promise<AssetListResult> {
  const rows = await betaDb()
    .select({
      ...ASSET_COLUMNS,
      totalAcquisitionCost: TOTAL_ACQUISITION_COST,
      totalResidualValue: TOTAL_RESIDUAL_VALUE,
    })
    .from(asset)
    .where(
      and(
        eq(asset.organization_id, scope.organizationId),
        filter.status ? eq(asset.status, filter.status) : undefined,
      ),
    )
    .orderBy(asc(asset.name), asc(asset.id))

  return {
    assets: rows.map(assetView),
    // No row means no rows matched, and there is no window aggregate to read
    // off an empty result — an empty book totals to zero, not to nothing.
    totals: {
      acquisitionCost: rows[0]?.totalAcquisitionCost ?? ZERO,
      residualValue: rows[0]?.totalResidualValue ?? ZERO,
    },
  }
}

/**
 * Přehled's "zůstatková hodnota majetku" KPI tile (spec §2.1 item 3), as ONE
 * row: the sum, the stamp behind it, and the two counts that say whether the sum
 * is the whole story.
 *
 * THE TWO COUNTS ARE THE POINT. `assetsForScope`'s footer SUM is over whatever
 * rows the page is showing, and `SUM` skips NULLs — so a book where the office
 * has provided oprávky for three of ten assets footers a number that is true of
 * three assets and reads as true of ten. On a table under a visible list of rows
 * that is fine; on a dashboard tile with nothing around it, it is a confidently
 * wrong number of exactly the kind §0.4 exists to prevent. The tile renders the
 * value only when `depreciatedCount === inUseCount`, and this shape is what lets
 * it ask.
 *
 * DISPOSED ASSETS ARE OUT of both counts and the sum. A vyřazený asset has no
 * residual value TO THIS COMPANY, whatever its accumulated depreciation says, so
 * including it would inflate the tile with property the client no longer owns.
 *
 * `depreciationAsOf` is the newest stamp among the rows summed — spec §2.7 /
 * Advisor F15: oprávky are provided as of a date and this product NEVER
 * interpolates them to today. The tile prints that date next to the value.
 */
export type AssetResidualSummary = {
  /** Assets still in use. */
  inUseCount: number
  /** How many of those carry an office-provided oprávky figure. */
  depreciatedCount: number
  /** SQL sum over exactly those rows, or null when none carries one. */
  residualTotal: string | null
  /** Newest `depreciation_as_of` behind the sum. Null iff `residualTotal` is. */
  depreciationAsOf: string | null
}

export async function assetResidualSummaryForScope(
  scope: OrgScope,
): Promise<AssetResidualSummary> {
  const rows = await betaDb().execute(sql`
    SELECT
      count(*) FILTER (WHERE a.status = 'in_use')::int
        AS in_use_count,
      count(*) FILTER (
        WHERE a.status = 'in_use' AND a.accumulated_depreciation IS NOT NULL
      )::int
        AS depreciated_count,
      SUM(a.acquisition_cost - a.accumulated_depreciation) FILTER (
        WHERE a.status = 'in_use' AND a.accumulated_depreciation IS NOT NULL
      )
        AS residual_total,
      max(a.depreciation_as_of) FILTER (
        WHERE a.status = 'in_use' AND a.accumulated_depreciation IS NOT NULL
      )::text
        AS depreciation_as_of
    FROM asset a
    WHERE a.organization_id = ${scope.organizationId}
  `)

  const row = (
    rows as unknown as {
      in_use_count: number
      depreciated_count: number
      residual_total: string | null
      depreciation_as_of: string | null
    }[]
  )[0]

  return {
    inUseCount: Number(row?.in_use_count ?? 0),
    depreciatedCount: Number(row?.depreciated_count ?? 0),
    residualTotal: row?.residual_total ?? null,
    depreciationAsOf: row?.depreciation_as_of ?? null,
  }
}

/** One asset for the Karta, or null — what the page turns into a 404. */
export async function assetForScope(
  scope: OrgScope,
  assetId: string,
): Promise<AssetView | null> {
  if (!UUID.test(assetId)) return null

  const [row] = await betaDb()
    .select(ASSET_COLUMNS)
    .from(asset)
    .where(
      and(
        eq(asset.organization_id, scope.organizationId),
        eq(asset.id, assetId),
      ),
    )
    .limit(1)

  return row ? assetView(row) : null
}

/** An asset's Karta event history, newest first. */
export async function assetEventsForScope(
  scope: OrgScope,
  assetId: string,
): Promise<AssetEventView[]> {
  if (!UUID.test(assetId)) return []

  const rows = await betaDb()
    .select({
      id: asset_event.id,
      kind: asset_event.kind,
      event_date: asset_event.event_date,
      amount: asset_event.amount,
      note: asset_event.note,
    })
    .from(asset_event)
    .where(
      and(
        eq(asset_event.organization_id, scope.organizationId),
        eq(asset_event.asset_id, assetId),
      ),
    )
    .orderBy(desc(asset_event.event_date), desc(asset_event.id))

  return rows.map(assetEventView)
}

// ---------------------------------------------------------------------------
// Office writes — owner-only, spec §3.3
// ---------------------------------------------------------------------------

/**
 * WHAT THE PORTAL IS ALLOWED TO WRITE. Every money value arrives as a STRING
 * and is stored verbatim (spec §0.7) — this file never parses, adds or rounds
 * one. `accumulatedDepreciation` and `depreciationAsOf` are BOTH-OR-NEITHER at
 * the database (`asset_depreciation_stamp_coherence`); this input type mirrors
 * that rather than accepting an incoherent pair the insert would then refuse.
 */
export type AssetWriteInput = {
  readonly name: string
  readonly category: BetaAssetCategory
  readonly isMinor?: boolean
  readonly acquisitionCost: string
  readonly acquiredOn?: string | null
  readonly placedInServiceOn?: string | null
  readonly accumulatedDepreciation?: string | null
  readonly depreciationAsOf?: string | null
  readonly taxResidualValue?: string | null
  readonly siteRef?: string | null
  readonly noteClient?: string | null
  readonly noteInternal?: string | null
  /**
   * The source system's own id (migration 0011) — the agent ingestion API's
   * upsert match key. Office-typed rows leave it NULL and are never overwritten
   * by an agent run.
   */
  readonly externalRef?: string | null
}

/** The asset an agent's `externalRef` names, with its current disposal state. */
export async function assetByExternalRef(
  scope: OwnerScope,
  externalRef: string,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string; status: BetaAssetStatus } | null> {
  const [row] = await executor
    .select({ id: asset.id, status: asset.status })
    .from(asset)
    .where(
      and(
        eq(asset.organization_id, scope.organizationId),
        eq(asset.external_ref, externalRef),
      ),
    )
    .limit(1)

  return row ?? null
}

/** Create an asset. Always starts `in_use` — disposal is its own write, below. */
export async function createAsset(
  scope: OwnerScope,
  input: AssetWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  const [row] = await executor
    .insert(asset)
    .values({
      organization_id: scope.organizationId,
      name: input.name,
      category: input.category,
      is_minor: input.isMinor ?? false,
      acquisition_cost: input.acquisitionCost,
      acquired_on: input.acquiredOn ?? null,
      placed_in_service_on: input.placedInServiceOn ?? null,
      accumulated_depreciation: input.accumulatedDepreciation ?? null,
      depreciation_as_of: input.depreciationAsOf ?? null,
      tax_residual_value: input.taxResidualValue ?? null,
      site_ref: input.siteRef ?? null,
      note_client: input.noteClient ?? null,
      note_internal: input.noteInternal ?? null,
      external_ref: input.externalRef ?? null,
    })
    .returning({ id: asset.id })

  if (!row) throw new Error("asset insert returned no row")
  return row
}

/**
 * The fields a general edit may change. `status` and `disposed_on` are NOT
 * among them — `disposeAsset` below is the only door to that transition, the
 * same separation `updateFiling` keeps from `kind` / `period_id`.
 */
export type AssetPatch = Partial<AssetWriteInput>

/**
 * Edit an asset's general fields.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary
 * key — without it, an id leaked or guessed from anywhere would let a holder
 * of ANY scope edit ANY asset; this database has no RLS behind the seam to
 * catch it. Returns whether a row matched, so the caller can 404 rather than
 * report a successful save of nothing.
 */
export async function updateAsset(
  scope: OwnerScope,
  assetId: string,
  patch: AssetPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const values = {
    ...("name" in patch ? { name: patch.name } : {}),
    ...("category" in patch ? { category: patch.category } : {}),
    ...("isMinor" in patch ? { is_minor: patch.isMinor } : {}),
    ...("acquisitionCost" in patch
      ? { acquisition_cost: patch.acquisitionCost }
      : {}),
    ...("acquiredOn" in patch ? { acquired_on: patch.acquiredOn ?? null } : {}),
    ...("placedInServiceOn" in patch
      ? { placed_in_service_on: patch.placedInServiceOn ?? null }
      : {}),
    ...("accumulatedDepreciation" in patch
      ? { accumulated_depreciation: patch.accumulatedDepreciation ?? null }
      : {}),
    ...("depreciationAsOf" in patch
      ? { depreciation_as_of: patch.depreciationAsOf ?? null }
      : {}),
    ...("taxResidualValue" in patch
      ? { tax_residual_value: patch.taxResidualValue ?? null }
      : {}),
    ...("siteRef" in patch ? { site_ref: patch.siteRef ?? null } : {}),
    ...("noteClient" in patch ? { note_client: patch.noteClient ?? null } : {}),
    ...("noteInternal" in patch
      ? { note_internal: patch.noteInternal ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await executor
    .update(asset)
    .set(values)
    .where(
      and(
        eq(asset.id, assetId),
        eq(asset.organization_id, scope.organizationId),
      ),
    )
    .returning({ id: asset.id })

  return updated.length > 0
}

/**
 * Dispose an asset. The one write that may set `status` / `disposed_on`,
 * kept separate from `updateAsset` for the same reason `updateFiling` keeps
 * `kind` / `period_id` off its own patch — a transition, not a field edit.
 *
 * One-way in this PR: there is no `reactivateAsset`. A mistaken disposal is an
 * edge case the SHALLOW depth of this module does not build an undo path for
 * (spec depth map); it is exactly as recoverable today as an accidental
 * `filed` filing status is.
 */
export async function disposeAsset(
  scope: OwnerScope,
  assetId: string,
  disposedOn: string,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const updated = await executor
    .update(asset)
    .set({ status: "disposed", disposed_on: disposedOn })
    .where(
      and(
        eq(asset.id, assetId),
        eq(asset.organization_id, scope.organizationId),
      ),
    )
    .returning({ id: asset.id })

  return updated.length > 0
}

export type AssetEventWriteInput = {
  readonly kind: BetaAssetEventKind
  readonly eventDate: string
  readonly amount?: string | null
  readonly note?: string | null
}

/**
 * Add an event to an asset's Karta history.
 *
 * `assetId` is not pre-verified against the scope's organization: the
 * COMPOSITE `asset_event_asset_fk` (asset_id, organization_id) refuses the
 * insert outright if the two disagree, the same database-level refusal
 * `createFiling` relies on for `period_id`. `assetForScope` is what the
 * calling page already used to render the Karta the form is posted from, so a
 * scope holder reaches this with a real asset id in the ordinary path; the FK
 * is the floor under a forged one.
 */
export async function addAssetEvent(
  scope: OwnerScope,
  assetId: string,
  input: AssetEventWriteInput,
): Promise<{ id: string }> {
  const [row] = await betaDb()
    .insert(asset_event)
    .values({
      organization_id: scope.organizationId,
      asset_id: assetId,
      kind: input.kind,
      event_date: input.eventDate,
      amount: input.amount ?? null,
      note: input.note ?? null,
    })
    .returning({ id: asset_event.id })

  if (!row) throw new Error("asset_event insert returned no row")
  return row
}
