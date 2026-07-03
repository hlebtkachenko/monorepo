/**
 * regime — the 3 bookkeeping regimes + their effects (§13, §13b, §7b ZDP).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE regime)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { bookKind } from "./_enums"

export const regime = pgTable("regime", {
  code: text("code").primaryKey(), // DOUBLE_ENTRY | SINGLE_ENTRY | TAX_RECORDS
  name: text("name").notNull(),
  requires_chart_of_accounts: boolean("requires_chart_of_accounts").notNull(),
  book_kind: bookKind("book_kind").notNull(),
})
