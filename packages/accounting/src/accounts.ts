/**
 * By-NUMBER account resolution (D8). Accounts are per-period (the chart is copied
 * forward each period, minting a new account UUID), but perennial rows — assets,
 * depreciation plans, open items, 701 carry-forward, předkontace templates —
 * reference accounts by their stable `number` (e.g. "311", "551"). The posting
 * generators resolve number → the active period's account_id here, failing loud
 * on an unresolved number (a missing posting account is a §25 defect, never a
 * silently-dropped posting).
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"

/** Resolve one account number to its id in the given period's chart. Throws if absent. */
export async function resolveAccountId(
  db: RowExecutor,
  periodId: string,
  number: string,
): Promise<string> {
  const found = await rows<{ id: string }>(
    db,
    sql`SELECT id FROM account WHERE period_id = ${periodId}::uuid AND number = ${number}`,
  )
  const first = found[0]
  if (first === undefined) {
    throw new Error(
      `accounting: account "${number}" is not in the period's chart of accounts (§25 — a posting account must exist before it is used)`,
    )
  }
  return first.id
}

/**
 * Resolve many account numbers at once (one query), returning number → id. Throws
 * listing every number missing from the period chart.
 */
export async function resolveAccountIds(
  db: RowExecutor,
  periodId: string,
  numbers: readonly string[],
): Promise<Map<string, string>> {
  const wanted = new Set(numbers)
  if (wanted.size === 0) return new Map()
  // The per-period chart is small (dozens of accounts); fetch it and filter in
  // JS rather than bind a Postgres array (drizzle spreads a JS array into a
  // tuple, which cannot cast to text[]).
  const found = await rows<{ id: string; number: string }>(
    db,
    sql`SELECT id, number FROM account WHERE period_id = ${periodId}::uuid`,
  )
  const map = new Map(
    found.filter((r) => wanted.has(r.number)).map((r) => [r.number, r.id]),
  )
  const missing = [...wanted].filter((n) => !map.has(n))
  if (missing.length > 0) {
    throw new Error(
      `accounting: account(s) ${missing.map((n) => `"${n}"`).join(", ")} not in the period's chart of accounts (§25)`,
    )
  }
  return map
}
