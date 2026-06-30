/**
 * currency — ISO 4217 currencies offered in accounting settings.
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE currency)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * The org's own accounting currency (měna účetnictví, §4/12) is pinned per účetní
 * období on accounting_period.accounting_currency; a document's transaction currency
 * rides on the capture layer (partial_record.currency_code).
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { char, pgTable, smallint, text } from "drizzle-orm/pg-core"

export const currency = pgTable("currency", {
  code: char("code", { length: 3 }).primaryKey(), // ISO 4217: CZK, EUR, USD, …
  name: text("name").notNull(),
  minor_units: smallint("minor_units").notNull().default(2), // fractional digits
})
