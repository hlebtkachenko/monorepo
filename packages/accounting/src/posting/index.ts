/**
 * Posting dispatcher — the regime on the účetní období selects the path
 * (posting_double_entry_line for DOUBLE_ENTRY, posting_monetary_line for the
 * monetary regimes). v2 has no separate účetní jednotka: the org IS the unit and
 * the regime is fixed per účetní období (regime_code), so the dispatcher reads
 * the period, not a unit.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type {
  DoubleEntryInput,
  MonetaryInput,
  OrgCtx,
  PostedPosting,
  Regime,
} from "../types"
import { postDoubleEntry } from "./double-entry"
import { postMonetary } from "./monetary"

export { postDoubleEntry } from "./double-entry"
export { postMonetary } from "./monetary"

/** Read the regime fixed on an účetní období. */
export async function getPeriodRegime(
  db: RowExecutor,
  periodId: string,
): Promise<Regime> {
  const r = await one<{ regime_code: Regime }>(
    db,
    sql`SELECT regime_code FROM accounting_period WHERE id = ${periodId}::uuid`,
  )
  return r.regime_code
}

export type PostInput =
  | { kind: "double"; entry: DoubleEntryInput }
  | { kind: "monetary"; entry: Omit<MonetaryInput, "regime"> }

/**
 * Post by regime (§4 routing). Validates the chosen posting shape matches the
 * period's regime (the DB also enforces this via the regime composite FK; this
 * gives a clearer error before the write).
 */
export async function post(
  db: RowExecutor,
  ctx: OrgCtx,
  input: PostInput,
): Promise<PostedPosting> {
  const regime = await getPeriodRegime(db, input.entry.periodId)
  if (input.kind === "double") {
    if (regime !== "DOUBLE_ENTRY") {
      throw new Error(
        `accounting: period ${input.entry.periodId} is ${regime}; a double-entry posting requires DOUBLE_ENTRY`,
      )
    }
    return postDoubleEntry(db, ctx, input.entry)
  }
  if (regime === "DOUBLE_ENTRY") {
    throw new Error(
      `accounting: period ${input.entry.periodId} is DOUBLE_ENTRY; use a double-entry posting, not a monetary posting`,
    )
  }
  return postMonetary(db, ctx, { ...input.entry, regime })
}
