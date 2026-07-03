/**
 * accounting_size — size categories + the 2-of-3 thresholds (§1b).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE accounting_size)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { integer, numeric, pgTable, text } from "drizzle-orm/pg-core"

export const accounting_size = pgTable("accounting_size", {
  code: text("code").primaryKey(), // MICRO | SMALL | MEDIUM | LARGE
  name: text("name").notNull(),
  max_assets: numeric("max_assets", { precision: 19, scale: 4 }),
  max_net_turnover: numeric("max_net_turnover", { precision: 19, scale: 4 }),
  max_average_employees: integer("max_average_employees"),
})
