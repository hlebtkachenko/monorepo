/**
 * Load / persist the provenanced DPPO worksheet inputs for one accounting period.
 * buildDppo (dppo.ts) requires the taxpayer category plus six ProvenancedDecimal
 * adjustments, ALL provenanced and none defaulted; production supplies them from
 * this per-period store instead of the empty `{}`.
 *
 * Storage model (see packages/db/migrations/0054_dppo_annual_adjustment.sql) —
 * two normalized tables, both replace-on-save (no version history):
 *  - dppo_annual_taxpayer_category: one row per period, present only when a
 *    category has been chosen. Row absent → taxpayerCategory omitted.
 *  - dppo_annual_adjustment: one row per ANSWERED adjustment, keyed by
 *    (organization_id, period_id, adjustment_key). Row absent → loadDppoAdjustments
 *    OMITS that field so buildDppo reports it as a blocking input; a present row
 *    (amount including "0") = confirmed. The provenance columns are NOT NULL, so
 *    every present row yields a full ProvenancedDecimal — no fallbacks.
 *  - provenance.source is always "USER" for this manual web surface;
 *    provenance.reference is required free text; provenance.recordedAt is the
 *    server transaction timestamp (now()) written at save.
 *
 * Runs through the organization-bound db (FORCE RLS), same as the setup helpers.
 */

import { sql } from "drizzle-orm"
import { rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal, OrgCtx } from "../types"
import type { AdjustmentProvenance } from "./annual-completeness"
import type { DppoTaxpayerCategory } from "./annual-rules"
import type { DppoInput } from "./dppo"

/** The six required DPPO adjustment keys (DppoInput), in worksheet order. */
export type DppoAdjustmentKey =
  | "nonDeductibleExpenses"
  | "exemptRevenue"
  | "excludeLossMakingMainActivity"
  | "lossCarryForward"
  | "taxReliefs"
  | "advancesPaid"

/**
 * The six adjustment keys in worksheet order. Each is stored verbatim as the
 * `adjustment_key` column value (the DB CHECK backs the set).
 */
const ADJUSTMENT_KEYS: readonly DppoAdjustmentKey[] = [
  "nonDeductibleExpenses",
  "exemptRevenue",
  "excludeLossMakingMainActivity",
  "lossCarryForward",
  "taxReliefs",
  "advancesPaid",
]

/** One answered adjustment to persist: an exact decimal amount + required reference. */
export interface DppoAdjustmentEntry {
  amount: Decimal
  reference: string
}

/**
 * The mutable per-period worksheet inputs to save. A null entry = not answered
 * (its row is deleted); taxpayerCategory null = not chosen (its row is deleted).
 * The whole answered set is replaced on every save.
 */
export interface DppoAdjustmentSaveInput {
  taxpayerCategory: DppoTaxpayerCategory | null
  entries: Record<DppoAdjustmentKey, DppoAdjustmentEntry | null>
}

/**
 * Load the persisted adjustments for a period as a `DppoInput`. Any adjustment
 * with no row is OMITTED (not answered), so buildDppo reports it as a blocking
 * input. Returns `{}` when nothing is stored (everything blocking).
 */
export async function loadDppoAdjustments(
  db: RowExecutor,
  periodId: string,
): Promise<DppoInput> {
  const input: DppoInput = {}

  const categoryRows = await rows<{ taxpayer_category: string }>(
    db,
    sql`SELECT taxpayer_category
          FROM dppo_annual_taxpayer_category
         WHERE period_id = ${periodId}::uuid`,
  )
  const category = categoryRows[0]?.taxpayer_category
  if (category != null)
    input.taxpayerCategory = category as DppoTaxpayerCategory

  const adjustmentRows = await rows<{
    adjustment_key: string
    amount: string
    source: string
    reference: string
    recorded_at: string
  }>(
    db,
    // Cast money + timestamp to text so amount / recorded_at arrive as strings.
    sql`SELECT adjustment_key,
               amount::text      AS amount,
               source,
               reference,
               recorded_at::text AS recorded_at
          FROM dppo_annual_adjustment
         WHERE period_id = ${periodId}::uuid`,
  )
  for (const row of adjustmentRows) {
    // adjustment_key / source are constrained by the DB CHECKs — a plain typed
    // read; every present row carries a full (NOT NULL) provenance.
    input[row.adjustment_key as DppoAdjustmentKey] = {
      amount: row.amount,
      provenance: {
        source: row.source as AdjustmentProvenance["source"],
        reference: row.reference,
        recordedAt: row.recorded_at,
      },
    }
  }
  return input
}

/**
 * Replace the per-period worksheet inputs on the org-scoped db (already inside
 * withOrganization). The taxpayer category row is upserted when chosen and
 * deleted otherwise; the answered adjustments are deleted and re-inserted, one
 * row per answered entry with source "USER" and now() as recorded_at.
 * organization_id is injected from ctx — never accepted as input — so RLS
 * WITH CHECK passes.
 */
export async function saveDppoAdjustments(
  db: RowExecutor,
  ctx: OrgCtx,
  periodId: string,
  input: DppoAdjustmentSaveInput,
): Promise<void> {
  // (1) Taxpayer category — upsert when chosen, delete otherwise.
  if (input.taxpayerCategory != null) {
    await db.execute(sql`
      INSERT INTO dppo_annual_taxpayer_category
        (organization_id, period_id, taxpayer_category)
      VALUES
        (${ctx.organizationId}::uuid, ${periodId}::uuid, ${input.taxpayerCategory}::text)
      ON CONFLICT (organization_id, period_id) DO UPDATE SET
        taxpayer_category = EXCLUDED.taxpayer_category,
        updated_at = now()
    `)
  } else {
    await db.execute(sql`
      DELETE FROM dppo_annual_taxpayer_category
       WHERE period_id = ${periodId}::uuid
    `)
  }

  // (2) Adjustments — replace the whole answered set for this period.
  await db.execute(sql`
    DELETE FROM dppo_annual_adjustment
     WHERE period_id = ${periodId}::uuid
  `)

  const answered = ADJUSTMENT_KEYS.flatMap((key) => {
    const entry = input.entries[key]
    return entry ? [{ key, entry }] : []
  })
  if (answered.length === 0) return

  const valueRows = answered.map(
    ({ key, entry }) => sql`(
      ${ctx.organizationId}::uuid,
      ${periodId}::uuid,
      ${key}::text,
      ${entry.amount}::numeric(19,4),
      'USER'::text,
      ${entry.reference}::text,
      now()
    )`,
  )

  await db.execute(sql`
    INSERT INTO dppo_annual_adjustment
      (organization_id, period_id, adjustment_key, amount, source, reference, recorded_at)
    VALUES ${sql.join(valueRows, sql`, `)}
  `)
}
