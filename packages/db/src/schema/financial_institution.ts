/**
 * financial_institution — Czech bank / payment-institution reference register
 * (Finance ▸ Číselníky ▸ Peněžní ústavy). The ČNB payment-system bank codes.
 *
 * Mirrors: packages/db/migrations/0080_financial_institution.sql
 *
 * Reference (system) table — shared, NOT tenant-scoped, no RLS (Case-B, like
 * `currency` / `country`). Rows seeded in 0081. Display names are NOT stored
 * here — they localize via next-intl (`bankNames`, keyed by bank_code). The
 * CHECK constraint lives in the migration, not this DSL.
 */
import { boolean, char, pgTable } from "drizzle-orm/pg-core"

export const financial_institution = pgTable("financial_institution", {
  bank_code: char("bank_code", { length: 4 }).primaryKey(), // 4-digit ČNB bank code
  active: boolean("active").notNull().default(true),
})
