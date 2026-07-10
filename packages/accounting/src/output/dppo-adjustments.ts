/**
 * Load / persist the provenanced DPPO worksheet inputs for one accounting period
 * (dppo_annual_adjustment). buildDppo (dppo.ts) requires the taxpayer category
 * plus six ProvenancedDecimal adjustments, ALL provenanced and none defaulted;
 * production supplies them from this per-period store instead of the empty `{}`.
 *
 * Storage model (see packages/db/migrations/0054_dppo_annual_adjustment.sql):
 *  - One MUTABLE row per (organization_id, period_id), overwritten on every save
 *    (no version history — unlike the [valid_from, valid_to] tax profile).
 *  - A stored amount that is NULL = not answered → loadDppoAdjustments OMITS that
 *    field so buildDppo reports it as a blocking input; a stored value (including
 *    "0") = confirmed.
 *  - provenance.source is always "USER" for this manual web surface;
 *    provenance.reference is required free text; provenance.recordedAt is the
 *    server transaction timestamp (now()) written at save.
 *
 * Runs through the organization-bound db (FORCE RLS), same as the setup helpers.
 */

import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
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

/** Each DppoInput adjustment key ↔ its snake_case column-group prefix (worksheet order). */
const ADJUSTMENT_COLUMNS: ReadonlyArray<{
  key: DppoAdjustmentKey
  column: string
}> = [
  { key: "nonDeductibleExpenses", column: "non_deductible_expenses" },
  { key: "exemptRevenue", column: "exempt_revenue" },
  {
    key: "excludeLossMakingMainActivity",
    column: "exclude_loss_making_main_activity",
  },
  { key: "lossCarryForward", column: "loss_carry_forward" },
  { key: "taxReliefs", column: "tax_reliefs" },
  { key: "advancesPaid", column: "advances_paid" },
]

/** One answered adjustment to persist: an exact decimal amount + required reference. */
export interface DppoAdjustmentEntry {
  amount: Decimal
  reference: string
}

/**
 * The mutable per-period worksheet inputs to save. A null entry = not answered
 * (its amount + provenance columns are cleared); taxpayerCategory null = not
 * chosen. The whole row is overwritten on every save.
 */
export interface DppoAdjustmentSaveInput {
  taxpayerCategory: DppoTaxpayerCategory | null
  entries: Record<DppoAdjustmentKey, DppoAdjustmentEntry | null>
}

/**
 * Load the persisted adjustments for a period as a `DppoInput`. Any field whose
 * stored amount is NULL is OMITTED (not answered), so buildDppo reports it as a
 * blocking input. Returns `{}` when no row exists yet (everything blocking).
 */
export async function loadDppoAdjustments(
  db: RowExecutor,
  periodId: string,
): Promise<DppoInput> {
  const selectColumns: SQL[] = [sql`taxpayer_category`]
  for (const { column } of ADJUSTMENT_COLUMNS) {
    const amount = sql.identifier(`${column}_amount`)
    const recordedAt = sql.identifier(`${column}_recorded_at`)
    selectColumns.push(
      // Cast money + timestamp to text so the row is uniformly string | null.
      sql`${amount}::text AS ${amount}`,
      sql`${sql.identifier(`${column}_source`)}`,
      sql`${sql.identifier(`${column}_reference`)}`,
      sql`${recordedAt}::text AS ${recordedAt}`,
    )
  }
  const result = await rows<Record<string, string | null>>(
    db,
    sql`SELECT ${sql.join(selectColumns, sql`, `)}
          FROM dppo_annual_adjustment
         WHERE period_id = ${periodId}::uuid`,
  )
  const row = result[0]
  if (!row) return {}

  const input: DppoInput = {}
  const category = row["taxpayer_category"]
  if (category != null)
    input.taxpayerCategory = category as DppoTaxpayerCategory
  for (const { key, column } of ADJUSTMENT_COLUMNS) {
    const amount = row[`${column}_amount`]
    if (amount == null) continue
    input[key] = {
      amount,
      provenance: {
        source: (row[`${column}_source`] ??
          "USER") as AdjustmentProvenance["source"],
        reference: row[`${column}_reference`] ?? "",
        recordedAt: row[`${column}_recorded_at`] ?? "",
      },
    }
  }
  return input
}

/**
 * Upsert the single per-period adjustments row (natural key
 * (organization_id, period_id)). An unanswered entry clears its amount +
 * provenance columns; an answered one writes the amount, source "USER", the
 * reference, and now() as recorded_at. organization_id is injected from ctx —
 * never accepted as input — so RLS WITH CHECK passes.
 */
export async function saveDppoAdjustments(
  db: RowExecutor,
  ctx: OrgCtx,
  periodId: string,
  input: DppoAdjustmentSaveInput,
): Promise<void> {
  const insertColumns: SQL[] = [
    sql`organization_id`,
    sql`period_id`,
    sql`taxpayer_category`,
  ]
  const insertValues: SQL[] = [
    sql`${ctx.organizationId}::uuid`,
    sql`${periodId}::uuid`,
    sql`${input.taxpayerCategory}`,
  ]
  const conflictSet: SQL[] = [
    sql`taxpayer_category = EXCLUDED.taxpayer_category`,
  ]

  for (const { key, column } of ADJUSTMENT_COLUMNS) {
    const entry = input.entries[key]
    const amountCol = sql.identifier(`${column}_amount`)
    const sourceCol = sql.identifier(`${column}_source`)
    const referenceCol = sql.identifier(`${column}_reference`)
    const recordedAtCol = sql.identifier(`${column}_recorded_at`)

    insertColumns.push(
      sql`${amountCol}`,
      sql`${sourceCol}`,
      sql`${referenceCol}`,
      sql`${recordedAtCol}`,
    )
    insertValues.push(
      sql`${entry ? entry.amount : null}::numeric(19,4)`,
      // provenance source is always USER for this manual web surface
      sql`${entry ? "USER" : null}::text`,
      sql`${entry ? entry.reference : null}::text`,
      // recordedAt = server transaction timestamp; NULL when unanswered
      entry ? sql`now()` : sql`NULL::timestamptz`,
    )
    for (const col of [amountCol, sourceCol, referenceCol, recordedAtCol]) {
      conflictSet.push(sql`${col} = EXCLUDED.${col}`)
    }
  }
  insertColumns.push(sql`updated_at`)
  insertValues.push(sql`now()`)
  conflictSet.push(sql`updated_at = now()`)

  await db.execute(sql`
    INSERT INTO dppo_annual_adjustment (${sql.join(insertColumns, sql`, `)})
    VALUES (${sql.join(insertValues, sql`, `)})
    ON CONFLICT (organization_id, period_id) DO UPDATE SET
      ${sql.join(conflictSet, sql`, `)}
  `)
}
