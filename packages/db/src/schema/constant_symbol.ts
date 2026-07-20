/**
 * constant_symbol — Czech konstantní symbol reference register (Finance ▸
 * Číselníky ▸ Konstantní symboly). The KS payment-code vocabulary.
 *
 * Mirrors: packages/db/migrations/0082_constant_symbol.sql
 *
 * Reference (system) table — shared, NOT tenant-scoped, no RLS (Case-B, like
 * `currency` / `country`). Rows seeded in 0083. Display names are NOT stored
 * here — they localize via next-intl (`constantSymbolNames`, keyed by code). The
 * CHECK constraint lives in the migration, not this DSL.
 */
import { boolean, char, pgTable } from "drizzle-orm/pg-core"

export const constant_symbol = pgTable("constant_symbol", {
  code: char("code", { length: 4 }).primaryKey(), // 4-digit konstantní symbol
  active: boolean("active").notNull().default(true),
})
