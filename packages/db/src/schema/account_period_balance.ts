/**
 * account_period_balance — double-entry obraty per (org, period, account).
 *
 * Mirrors: packages/db/migrations/0032_accounting_read_model.sql (CREATE TABLE account_period_balance)
 *
 * Read-model turnover TABLE (NOT a view). Maintained by a SECURITY DEFINER trigger
 * (migration); ENABLE-not-FORCE RLS so the maintenance owner writes through and the
 * app reads its own org only (M5). NOT in ORGANIZATION_SCOPED_TABLES (which is the
 * FORCE-RLS set). closing_balance is GENERATED ALWAYS STORED — a read-only projection.
 * Composite PK (org, period, account) is the ON CONFLICT target. Triggers / RLS live
 * in the migration, not this DSL.
 */
import {
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { account } from "./account"
import { accounting_period } from "./accounting_period"

export const account_period_balance = pgTable(
  "account_period_balance",
  {
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(),
    account_id: uuid("account_id").notNull(), // the PERIOD chart account
    opening_balance: numeric("opening_balance", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // počáteční stav (carried from prior closing; 0 for P&L)
    turnover_debit: numeric("turnover_debit", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // obrat MD (signed-accumulating)
    turnover_credit: numeric("turnover_credit", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // obrat Dal
    // GENERATED ALWAYS STORED — read-only projection (konečný stav)
    closing_balance: numeric("closing_balance", {
      precision: 19,
      scale: 4,
    }).generatedAlwaysAs(
      sql`opening_balance + turnover_debit - turnover_credit`,
    ),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.organization_id, t.period_id, t.account_id],
    }),
    foreignKey({
      name: "account_period_balance_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [
        accounting_period.id,
        accounting_period.organization_id,
      ],
    }),
    foreignKey({
      name: "account_period_balance_account_fk",
      columns: [t.account_id, t.organization_id],
      foreignColumns: [account.id, account.organization_id],
    }),
    foreignKey({
      name: "account_period_balance_acct_period_fk",
      columns: [t.account_id, t.period_id],
      foreignColumns: [account.id, account.period_id],
    }),
  ],
)
