/**
 * vat_regime — possible VAT statuses + how they work (neplátce / plátce / IO).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE vat_regime)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { pgTable, text } from "drizzle-orm/pg-core"

export const vat_regime = pgTable("vat_regime", {
  code: text("code").primaryKey(), // NON_PAYER | PAYER | IDENTIFIED_PERSON
  name: text("name").notNull(),
})
