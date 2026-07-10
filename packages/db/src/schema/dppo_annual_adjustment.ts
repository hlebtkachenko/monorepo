/**
 * dppo_annual_adjustment — per-accounting-period provenanced DPPO inputs the
 * corporate-income-tax worksheet (buildDppo) needs but cannot derive from the
 * books: the taxpayer category (§17a/§21 ZDP) and the six statutory adjustments
 * (§25 non-deductible, §18a/§19 exempt, §18a/1 loss-making main activity, §34
 * loss carry-forward, §35 reliefs, §38a advances). One MUTABLE row per
 * (organization_id, period_id), overwritten on save; each answered amount
 * carries USER provenance (<key>_source / <key>_reference / <key>_recorded_at).
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
import { sql } from "drizzle-orm"
import {
  check,
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
    // STANDARD | BASIC_INVESTMENT_FUND | QUALIFYING_PENSION_INSTITUTION | OTHER
    // (CHECK in the migration); NULL until chosen.
    taxpayer_category: text("taxpayer_category"),

    // §25 daňově neuznatelné náklady
    non_deductible_expenses_amount: numeric("non_deductible_expenses_amount", {
      precision: 19,
      scale: 4,
    }),
    non_deductible_expenses_source: text("non_deductible_expenses_source"),
    non_deductible_expenses_reference: text(
      "non_deductible_expenses_reference",
    ),
    non_deductible_expenses_recorded_at: timestamp(
      "non_deductible_expenses_recorded_at",
      { withTimezone: true },
    ),

    // §18a/§19 osvobozené / nezahrnované výnosy
    exempt_revenue_amount: numeric("exempt_revenue_amount", {
      precision: 19,
      scale: 4,
    }),
    exempt_revenue_source: text("exempt_revenue_source"),
    exempt_revenue_reference: text("exempt_revenue_reference"),
    exempt_revenue_recorded_at: timestamp("exempt_revenue_recorded_at", {
      withTimezone: true,
    }),

    // §18a/1 ztráta z hlavní (nevýdělečné) činnosti
    exclude_loss_making_main_activity_amount: numeric(
      "exclude_loss_making_main_activity_amount",
      { precision: 19, scale: 4 },
    ),
    exclude_loss_making_main_activity_source: text(
      "exclude_loss_making_main_activity_source",
    ),
    exclude_loss_making_main_activity_reference: text(
      "exclude_loss_making_main_activity_reference",
    ),
    exclude_loss_making_main_activity_recorded_at: timestamp(
      "exclude_loss_making_main_activity_recorded_at",
      { withTimezone: true },
    ),

    // §34 odpočet daňové ztráty minulých let
    loss_carry_forward_amount: numeric("loss_carry_forward_amount", {
      precision: 19,
      scale: 4,
    }),
    loss_carry_forward_source: text("loss_carry_forward_source"),
    loss_carry_forward_reference: text("loss_carry_forward_reference"),
    loss_carry_forward_recorded_at: timestamp(
      "loss_carry_forward_recorded_at",
      {
        withTimezone: true,
      },
    ),

    // §35 slevy na dani
    tax_reliefs_amount: numeric("tax_reliefs_amount", {
      precision: 19,
      scale: 4,
    }),
    tax_reliefs_source: text("tax_reliefs_source"),
    tax_reliefs_reference: text("tax_reliefs_reference"),
    tax_reliefs_recorded_at: timestamp("tax_reliefs_recorded_at", {
      withTimezone: true,
    }),

    // §38a zaplacené zálohy na daň
    advances_paid_amount: numeric("advances_paid_amount", {
      precision: 19,
      scale: 4,
    }),
    advances_paid_source: text("advances_paid_source"),
    advances_paid_reference: text("advances_paid_reference"),
    advances_paid_recorded_at: timestamp("advances_paid_recorded_at", {
      withTimezone: true,
    }),

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
      columns: [t.organization_id, t.period_id],
    }),
    foreignKey({
      name: "dppo_annual_adjustment_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    // Provenance is all-or-none per adjustment group: each group's four columns
    // are either all NULL (unanswered) or all set (answered). Mirrors the
    // num_nulls(...) IN (0, 4) CHECK constraints in the migration.
    check(
      "dppo_annual_adjustment_non_deductible_expenses_provenance_chk",
      sql`num_nulls(${t.non_deductible_expenses_amount}, ${t.non_deductible_expenses_source}, ${t.non_deductible_expenses_reference}, ${t.non_deductible_expenses_recorded_at}) in (0, 4)`,
    ),
    check(
      "dppo_annual_adjustment_exempt_revenue_provenance_chk",
      sql`num_nulls(${t.exempt_revenue_amount}, ${t.exempt_revenue_source}, ${t.exempt_revenue_reference}, ${t.exempt_revenue_recorded_at}) in (0, 4)`,
    ),
    check(
      "dppo_annual_adjustment_exclude_loss_activity_provenance_chk",
      sql`num_nulls(${t.exclude_loss_making_main_activity_amount}, ${t.exclude_loss_making_main_activity_source}, ${t.exclude_loss_making_main_activity_reference}, ${t.exclude_loss_making_main_activity_recorded_at}) in (0, 4)`,
    ),
    check(
      "dppo_annual_adjustment_loss_carry_forward_provenance_chk",
      sql`num_nulls(${t.loss_carry_forward_amount}, ${t.loss_carry_forward_source}, ${t.loss_carry_forward_reference}, ${t.loss_carry_forward_recorded_at}) in (0, 4)`,
    ),
    check(
      "dppo_annual_adjustment_tax_reliefs_provenance_chk",
      sql`num_nulls(${t.tax_reliefs_amount}, ${t.tax_reliefs_source}, ${t.tax_reliefs_reference}, ${t.tax_reliefs_recorded_at}) in (0, 4)`,
    ),
    check(
      "dppo_annual_adjustment_advances_paid_provenance_chk",
      sql`num_nulls(${t.advances_paid_amount}, ${t.advances_paid_source}, ${t.advances_paid_reference}, ${t.advances_paid_recorded_at}) in (0, 4)`,
    ),
  ],
)
