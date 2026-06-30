/**
 * depreciation_group — odpisová skupina 1–6, ZDP §30 Příloha 1.
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE depreciation_group)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import { numeric, pgTable, smallint, text } from "drizzle-orm/pg-core"

export const depreciation_group = pgTable("depreciation_group", {
  code: smallint("code").primaryKey(), // 1..6
  period_years: smallint("period_years").notNull(), // 3/5/10/20/30/50
  linear_rate_first: numeric("linear_rate_first", { precision: 6, scale: 3 }), // sazba 1. rok (§31)
  linear_rate_subsequent: numeric("linear_rate_subsequent", {
    precision: 6,
    scale: 3,
  }), // sazba další roky
  linear_rate_improvement: numeric("linear_rate_improvement", {
    precision: 6,
    scale: 3,
  }), // sazba pro zvýšenou vstupní cenu
  accel_coeff_first: smallint("accel_coeff_first"), // koeficient 1. rok (§32)
  accel_coeff_subsequent: smallint("accel_coeff_subsequent"), // koeficient další roky
  accel_coeff_improvement: smallint("accel_coeff_improvement"), // koeficient pro zvýšenou ZC
  name: text("name"),
})
