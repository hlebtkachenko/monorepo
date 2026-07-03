/**
 * account — a tenant účet in one chart.
 *
 * Mirrors: packages/db/migrations/0028_accounting_chart.sql (CREATE TABLE account)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * The 4 structural levels (class / group_code / synthetic_code / is_synthetic) are
 * GENERATED from `number` / `parent_id` (zero drift) — read-only projections. The
 * only user-chosen stored flag is tracks_open_items (saldokonto). Composite FKs
 * (chart / chart-period / parent / group / directive) + the four UNIQUE targets used
 * by posting lines and balances are mirrored below. Triggers / RLS / CHECK constraints
 * live in the migration, not this DSL.
 */
import {
  boolean,
  char,
  foreignKey,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accountNature, debitCredit } from "./_enums"
import { account_group } from "./account_group"
import { chart_of_accounts } from "./chart_of_accounts"
import { directive_account } from "./directive_account"

export const account = pgTable(
  "account",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    chart_id: uuid("chart_id").notNull(),
    period_id: uuid("period_id").notNull(), // B1: = the chart's period
    parent_id: uuid("parent_id"), // analytical -> synthetic (§16); same chart
    number: text("number").notNull(), // '31','311','311.001'
    name: text("name").notNull(),
    nature: accountNature("nature").notNull(),
    normal_balance: debitCredit("normal_balance"), // NULL where sign-flips (431,481,FX)
    tracks_open_items: boolean("tracks_open_items").notNull().default(false), // saldokonto — the ONE stored flag
    // structural levels: GENERATED from `number` only (read-only projections)
    class: smallint("class").generatedAlwaysAs(sql`left(number,1)::int`),
    group_code: char("group_code", { length: 2 }).generatedAlwaysAs(
      sql`CASE WHEN left(number,1) IN ('8','9') THEN NULL ELSE left(replace(number,'.',''),2)::char(2) END`,
    ),
    synthetic_code: text("synthetic_code").generatedAlwaysAs(
      sql`left(replace(number,'.',''),3)`,
    ),
    is_synthetic: boolean("is_synthetic").generatedAlwaysAs(
      sql`parent_id IS NULL`,
    ),
    specializes_directive_code: char("specializes_directive_code", {
      length: 3,
    }), // nullable soft link to the 3-digit catalogue; NULL -> account_group fallback
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("account_id_org_unique").on(t.id, t.organization_id),
    unique("account_id_chart_unique").on(t.id, t.chart_id),
    unique("account_id_period_unique").on(t.id, t.period_id),
    unique("account_chart_number_unique").on(t.chart_id, t.number),
    foreignKey({
      name: "account_chart_fk",
      columns: [t.chart_id, t.organization_id],
      foreignColumns: [chart_of_accounts.id, chart_of_accounts.organization_id],
    }),
    foreignKey({
      name: "account_chart_period_fk",
      columns: [t.chart_id, t.period_id],
      foreignColumns: [chart_of_accounts.id, chart_of_accounts.period_id],
    }),
    // account_parent_fk (parent_id, chart_id) -> account(id, chart_id): a composite
    // SELF-FK. Kept in the migration (authoritative); omitted from the DSL to avoid
    // drizzle's self-referential circular type inference. Typed queries don't need it.
    foreignKey({
      name: "account_group_fk",
      columns: [t.group_code],
      foreignColumns: [account_group.code],
    }),
    foreignKey({
      name: "account_directive_fk",
      columns: [t.specializes_directive_code],
      foreignColumns: [directive_account.code],
    }),
  ],
)
