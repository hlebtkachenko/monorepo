/**
 * dppo_annual_adjustment — one row per ANSWERED DPPO adjustment the
 * corporate-income-tax worksheet (buildDppo) needs but cannot derive from the
 * books (§25 non-deductible, §18a/§19 exempt, §18a/1 loss-making main activity,
 * §34 loss carry-forward, §35 reliefs, §38a advances). A row exists only when
 * the adjustment has been answered; "not answered" = row absent. Each row
 * carries its provenance inline (source / reference / recorded_at, all NOT
 * NULL) — the all-or-none invariant lives in the row's existence, so
 * loadDppoAdjustments reads a full ProvenancedDecimal off every present row.
 * The taxpayer category lives in its sibling dppo_annual_taxpayer_category.
 *
 * Mirrors: packages/db/migrations/0054_dppo_annual_adjustment.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation). Composite PRIMARY
 * KEY (organization_id, period_id, adjustment_key) is the natural key + lookup
 * index. The composite FK (period_id, organization_id) → accounting_period
 * (id, organization_id) keeps tenant isolation across the FK (FK checks bypass
 * RLS). RLS policy + CHECK constraints live in the migration, not this DSL
 * (repo convention — no schema file declares pgPolicy / CHECK).
 */
import {
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { accounting_period } from "./accounting_period"
import { organization } from "./organization"

export const dppo_annual_adjustment = pgTable(
  "dppo_annual_adjustment",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    period_id: uuid("period_id").notNull(),
    // nonDeductibleExpenses | exemptRevenue | excludeLossMakingMainActivity |
    // lossCarryForward | taxReliefs | advancesPaid (CHECK in the migration).
    adjustment_key: text("adjustment_key").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    // USER | ADVISOR | LEDGER (CHECK in the migration).
    source: text("source").notNull(),
    reference: text("reference").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "dppo_annual_adjustment_pkey",
      columns: [t.organization_id, t.period_id, t.adjustment_key],
    }),
    foreignKey({
      name: "dppo_annual_adjustment_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
  ],
)
