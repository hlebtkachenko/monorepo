/**
 * Posting dispatcher — the regime on ucetni_jednotka selects the path
 * (zapis_radek for PODVOJNE, penezni_denik_radek for the cash-book regimes).
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type {
  CashEntryInput,
  DoubleEntryInput,
  PostedEntry,
  Regime,
  UnitCtx,
} from "../types"
import { postDoubleEntry } from "./podvojne"
import { postCashEntry } from "./cash-book"

export { postDoubleEntry } from "./podvojne"
export { postCashEntry } from "./cash-book"

/** Read the regime declared on an accounting unit. */
export async function getUnitRegime(
  db: RowExecutor,
  jednotkaId: string,
): Promise<Regime> {
  const r = await one<{ regime: Regime }>(
    db,
    sql`SELECT regime FROM ucetni_jednotka WHERE id = ${jednotkaId}::uuid`,
  )
  return r.regime
}

export type PostInput =
  | { kind: "double"; entry: DoubleEntryInput }
  | { kind: "cash"; entry: CashEntryInput }

/**
 * Post by regime (§4 routing). Validates the chosen posting shape matches the
 * unit's declared regime (the DB also enforces this via the regime composite
 * FK; this gives a clearer error before the write).
 */
export async function post(
  db: RowExecutor,
  ctx: UnitCtx,
  input: PostInput,
): Promise<PostedEntry> {
  const regime = await getUnitRegime(db, ctx.jednotkaId)
  if (input.kind === "double") {
    if (regime !== "PODVOJNE") {
      throw new Error(
        `accounting: unit ${ctx.jednotkaId} is ${regime}; a double-entry posting requires PODVOJNE`,
      )
    }
    return postDoubleEntry(db, ctx, input.entry)
  }
  if (regime === "PODVOJNE") {
    throw new Error(
      `accounting: unit ${ctx.jednotkaId} is PODVOJNE; use a double-entry posting, not a cash-book posting`,
    )
  }
  return postCashEntry(db, ctx, { ...input.entry, regime })
}
