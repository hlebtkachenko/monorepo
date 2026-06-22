/**
 * Supporting postings (UC-4). odpisovy_plan generates monthly depreciation
 * ucetni_zapis rows; inventurni_soupis differences (manko/přebytek) generate
 * adjustment postings. Both are PODVOJNE double-entry postings carrying the
 * originating plan/inventory FK, so the audit trail links the posting to its
 * source. Run inside a withOrganization transaction.
 */

import type { RowExecutor } from "./sql"
import { postDoubleEntry } from "./posting/podvojne"
import type { Decimal, PostedEntry, Strana, UnitCtx } from "./types"

export interface DepreciationInput {
  odpisovyPlanId: string
  obdobiId: string
  dokladId: string
  pripadId: string
  datum: string
  odpovednaOsoba: string
  /** Expense account (e.g. 551 Odpisy). */
  nakladovyUcetId: string
  /** Accumulated-depreciation account (e.g. 08x Oprávky). */
  opravkyUcetId: string
  castka: Decimal
}

/** Generate one depreciation posting: MD náklad / D oprávky, linked to the plan. */
export function generateDepreciation(
  db: RowExecutor,
  ctx: UnitCtx,
  input: DepreciationInput,
): Promise<PostedEntry> {
  return postDoubleEntry(db, ctx, {
    obdobiId: input.obdobiId,
    dokladId: input.dokladId,
    pripadId: input.pripadId,
    datum: input.datum,
    odpovednaOsoba: input.odpovednaOsoba,
    odpisovyPlanId: input.odpisovyPlanId,
    lines: [
      { ucetId: input.nakladovyUcetId, strana: "MD", castka: input.castka },
      { ucetId: input.opravkyUcetId, strana: "D", castka: input.castka },
    ],
  })
}

export interface InventoryDifferenceInput {
  inventuraId: string
  obdobiId: string
  dokladId: string
  pripadId: string
  datum: string
  odpovednaOsoba: string
  /** Balanced lines for the manko/přebytek adjustment. */
  lines: Array<{ ucetId: string; strana: Strana; castka: Decimal }>
}

/** Generate an inventory-difference (manko/přebytek) posting, linked to the inventory. */
export function recordInventoryDifference(
  db: RowExecutor,
  ctx: UnitCtx,
  input: InventoryDifferenceInput,
): Promise<PostedEntry> {
  return postDoubleEntry(db, ctx, {
    obdobiId: input.obdobiId,
    dokladId: input.dokladId,
    pripadId: input.pripadId,
    datum: input.datum,
    odpovednaOsoba: input.odpovednaOsoba,
    inventuraId: input.inventuraId,
    lines: input.lines,
  })
}
