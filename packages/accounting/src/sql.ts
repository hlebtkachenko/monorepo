/**
 * Query helpers for the accounting domain.
 *
 * Every accounting query runs as parameterized `sql` through the
 * organization-bound transaction handed in by `withOrganization`. We use raw
 * SQL (not the Drizzle query builder) deliberately:
 *
 *   - Money is `numeric(19,4)`: decimal strings pass straight through, exact,
 *     with no float and no Money<Currency> bigint-minor-unit conversion (the
 *     repo's money() brand is compile-time only — ADR-0013). The domain does
 *     ZERO money arithmetic in TypeScript; all sums/balances are computed in
 *     SQL (R13).
 *   - Books are SQL views; aggregations belong in SQL.
 *
 * `rows` delegates to `@workspace/db`'s `executeRows` — the single audited home
 * for the driver-result cast. `one` adds a no-row guard on top.
 */

import type { SQL } from "drizzle-orm"
import { executeRows } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"

/** The organization-bound transaction handed in by withOrganization. */
export type RowExecutor = OrganizationBoundDb

/** Run a parameterized query and return its rows, typed by the caller. */
export function rows<T>(db: RowExecutor, query: SQL): Promise<T[]> {
  return executeRows<T>(db, query)
}

/** Run a query expected to return exactly one row; throws if it returns none. */
export async function one<T>(db: RowExecutor, query: SQL): Promise<T> {
  const result = await rows<T>(db, query)
  const first = result[0]
  if (first === undefined) {
    throw new Error("accounting: expected exactly one row, got none")
  }
  return first
}
