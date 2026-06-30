/**
 * legal_form — entity legal forms (s.r.o., a.s., spolek, nadace, OSVČ, …).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE legal_form)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { personType } from "./_enums"

export const legal_form = pgTable("legal_form", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  person_type: personType("person_type").notNull(),
  mandatory_double_entry: boolean("mandatory_double_entry")
    .notNull()
    .default(false),
  audit_possible: boolean("audit_possible").notNull().default(true),
})
