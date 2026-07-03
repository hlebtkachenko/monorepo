/**
 * monetary_period_summary — cash-regime (peněžní deník) totals.
 *
 * Mirrors: packages/db/migrations/0032_accounting_read_model.sql (CREATE TABLE monetary_period_summary)
 *
 * Read-model turnover TABLE (NOT a view). Maintained by a SECURITY DEFINER trigger
 * (migration); ENABLE-not-FORCE RLS so the maintenance owner writes through and the
 * app reads its own org only (M5). NOT in ORGANIZATION_SCOPED_TABLES (the FORCE-RLS set).
 * Surrogate id PK because a nullable category_id can't sit in a PRIMARY KEY; the
 * grain UNIQUE uses NULLS NOT DISTINCT (folds uncategorized) and is the ON CONFLICT
 * target. Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  boolean,
  foreignKey,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { monetaryDirection, monetaryLocation } from "./_enums"
import { accounting_period } from "./accounting_period"
import { category } from "./category"

export const monetary_period_summary = pgTable(
  "monetary_period_summary",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`), // surrogate: nullable category_id can't sit in a PK
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(),
    category_id: uuid("category_id"), // nullable (uncategorized); folds via NULLS NOT DISTINCT
    direction: monetaryDirection("direction").notNull(), // INFLOW / OUTFLOW (příjem/výdaj)
    is_tax_relevant: boolean("is_tax_relevant").notNull(), // daňový vs nedaňový (§9)
    is_clearing: boolean("is_clearing").notNull(), // průběžná položka
    location: monetaryLocation("location").notNull(), // CASH (hotovost) / BANK (banka)
    total_amount: numeric("total_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    total_tax_base: numeric("total_tax_base", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // Σ zaklad_dane (the §7b daňový základ)
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "monetary_period_summary_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [
        accounting_period.id,
        accounting_period.organization_id,
      ],
    }),
    foreignKey({
      name: "monetary_period_summary_category_fk",
      columns: [t.category_id, t.organization_id],
      foreignColumns: [category.id, category.organization_id],
    }),
    unique("monetary_period_summary_grain_unique")
      .on(
        t.organization_id,
        t.period_id,
        t.category_id,
        t.direction,
        t.is_tax_relevant,
        t.is_clearing,
        t.location,
      )
      .nullsNotDistinct(),
  ],
)
