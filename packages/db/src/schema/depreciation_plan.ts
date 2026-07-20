/**
 * depreciation_plan — ÚČETNÍ odpisový plán; drives MD 551 / D 08x monthly (ČÚS 013,
 * Vyhláška §56). Revision history (D4). Closes posting.depreciation_plan_id.
 *
 * Mirrors: packages/db/migrations/0031_accounting_supporting.sql (CREATE TABLE depreciation_plan)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Self-FK supersedes_plan_id keeps revision history (D4). Account references are
 * BY NUMBER (D8). Triggers / RLS / CHECK constraints (account-shape) live in the
 * migration, not this DSL.
 */
import {
  date,
  foreignKey,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { depreciationMethod, depreciationPlanStatus } from "./_enums"
import { asset } from "./asset"
import { organization } from "./organization"

export const depreciation_plan = pgTable(
  "depreciation_plan",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    asset_id: uuid("asset_id").notNull(),
    supersedes_plan_id: uuid("supersedes_plan_id"), // D4: prior plan this revises (self-FK)
    method: depreciationMethod("method").notNull(), // účetní; MVP STRAIGHT_LINE
    start_date: date("start_date").notNull(), // = commissioning_date (or revision date)
    useful_life_months: smallint("useful_life_months"), // doba odpisování (STRAIGHT_LINE)
    residual_value: numeric("residual_value", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // zbytková hodnota (§56/3)
    monthly_amount: numeric("monthly_amount", {
      precision: 19,
      scale: 4,
    }).notNull(), // měsíční účetní odpis
    expense_account_number: text("expense_account_number").notNull(), // D8: účet 551 number
    accumulated_account_number: text("accumulated_account_number").notNull(), // D8: účet 08x/07x number
    status: depreciationPlanStatus("status").notNull().default("ACTIVE"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("depreciation_plan_id_org_unique").on(t.id, t.organization_id),
    foreignKey({
      name: "depreciation_plan_asset_fk",
      columns: [t.asset_id, t.organization_id],
      foreignColumns: [asset.id, asset.organization_id],
    }),
    // depreciation_plan_supersedes_fk (supersedes_plan_id, organization_id) -> depreciation_plan:
    // a composite SELF-FK. Kept in the migration (authoritative); omitted from the DSL to
    // avoid drizzle's self-referential circular type inference.
  ],
)
