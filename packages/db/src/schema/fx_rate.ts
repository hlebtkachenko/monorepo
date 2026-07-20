/**
 * fx_rate — shared exchange-rate reference table for the Finance module: the ČNB
 * daily-fix (and other platform-sourced) rates, identical for every tenant.
 *
 * Mirrors: packages/db/migrations/0072_fx_rate.sql
 *
 * Reference (law-like) table — shared, NOT tenant-scoped, no RLS (Case B, like
 * currency). app_user reads; the ČNB ingest job / migrations write. `rate` is
 * numeric(18,6), coherent with the frozen per-transaction rate columns
 * (partial_record.fx_rate, open_item_settlement.settlement_fx_rate).
 * `unit_amount` is ČNB "množství" (e.g. 100 JPY): the rate is CZK per
 * (unit_amount × from-currency). Precedence override->ČNB->error and the
 * no-auto-invert / no-neighbour-date rules live in the resolver (FxRate.convert),
 * not this DSL. CHECKs + unique + index live in the migration.
 */
import {
  char,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { fxRateKind } from "./_enums"
import { currency } from "./currency"

export const fx_rate = pgTable(
  "fx_rate",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    from_code: char("from_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    to_code: char("to_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    rate_date: date("rate_date").notNull(),
    rate_kind: fxRateKind("rate_kind").notNull().default("DAILY"),
    unit_amount: integer("unit_amount").notNull().default(1), // množství
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(), // kurz
    source: text("source").notNull().default("CNB"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("fx_rate_natural_unique").on(
      t.from_code,
      t.to_code,
      t.rate_date,
      t.rate_kind,
      t.source,
    ),
  ],
)
