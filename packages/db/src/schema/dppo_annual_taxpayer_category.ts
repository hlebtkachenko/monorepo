/**
 * dppo_annual_taxpayer_category — the DPPO taxpayer category (§17a/§21 ZDP) the
 * corporate-income-tax worksheet (buildDppo) needs to resolve the rate. One row
 * per (organization_id, period_id), present ONLY when a category has been
 * chosen; "not chosen" = row absent. Replace-on-save (no version history). Its
 * sibling dppo_annual_adjustment holds the six answered statutory adjustments.
 *
 * Mirrors: packages/db/migrations/0054_dppo_annual_adjustment.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation). Composite PRIMARY
 * KEY (organization_id, period_id) is the natural key + upsert target + lookup
 * index. The composite FK (period_id, organization_id) → accounting_period
 * (id, organization_id) keeps tenant isolation across the FK (FK checks bypass
 * RLS). RLS policy + CHECK constraint live in the migration, not this DSL
 * (repo convention — no schema file declares pgPolicy / CHECK).
 */
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { accounting_period } from "./accounting_period"
import { organization } from "./organization"

export const dppo_annual_taxpayer_category = pgTable(
  "dppo_annual_taxpayer_category",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    period_id: uuid("period_id").notNull(),
    // STANDARD | BASIC_INVESTMENT_FUND | QUALIFYING_PENSION_INSTITUTION | OTHER
    // (CHECK in the migration).
    taxpayer_category: text("taxpayer_category").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "dppo_annual_taxpayer_category_pkey",
      columns: [t.organization_id, t.period_id],
    }),
    foreignKey({
      name: "dppo_annual_taxpayer_category_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
  ],
)
