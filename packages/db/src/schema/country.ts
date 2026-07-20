/**
 * country — ISO 3166-1 country reference register (Adresář ▸ Veřejné číselníky ▸ Státy).
 *
 * Mirrors: packages/db/migrations/0072_country.sql (CREATE TABLE country).
 *
 * Reference (system) table — shared, NOT tenant-scoped, no RLS. Rows seeded in 0073.
 * Display names are NOT stored here — they localize via next-intl (`countryNames`, keyed
 * by iso2). currency_code is a plain ISO-4217 code (no FK — the currency table is a 5-row
 * functional-currency subset). CHECK constraints live in the migration, not this DSL.
 */
import { boolean, char, pgTable, varchar } from "drizzle-orm/pg-core"

export const country = pgTable("country", {
  iso2: char("iso2", { length: 2 }).primaryKey(), // ISO 3166-1 alpha-2
  currency_code: varchar("currency_code", { length: 3 }), // ISO 4217; NULL where unknown
  active: boolean("active").notNull().default(true),
})
