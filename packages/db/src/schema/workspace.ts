/**
 * workspace — parent tenant (accounting office).
 *
 * Mirrors: packages/db/migrations/0005_workspace.sql (CREATE TABLE workspace)
 * Onboarding step columns added in 0011_onboarding.sql.
 *
 * Design notes:
 *   - No slug column (workspace identified by UUID only).
 *   - created_by_user_id NOT NULL.
 *   - display_name NOT NULL.
 */
import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { billingPlan, workspaceTeamSize, workspaceUseCase } from "./_enums"

export const workspace = pgTable("workspace", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  created_by_user_id: uuid("created_by_user_id")
    .notNull()
    .references(() => app_user.id),
  display_name: text("display_name").notNull(),
  purpose: text("purpose"),
  contact_email: text("contact_email"),
  contact_phone: varchar("contact_phone", { length: 20 }),
  website: text("website"),

  // Onboarding wizard collects these — added in migration 0012_onboarding_extensions.sql
  use_case: workspaceUseCase("use_case"),
  team_size: workspaceTeamSize("team_size"),

  // Plan picked at onboarding step 5 — added in migration 0013_workspace_plan_column.sql.
  // workspace_billing.plan was dropped in the same migration; workspace.plan is
  // the single source of truth from onboarding through later billing setup.
  plan: billingPlan("plan").notNull().default("starter"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // Onboarding step columns — added in migration 0011_onboarding.sql
  beta_plan_acknowledged_at: timestamp("beta_plan_acknowledged_at", {
    withTimezone: true,
  }),
  step_1_completed_at: timestamp("step_1_completed_at", { withTimezone: true }),
  step_2_completed_at: timestamp("step_2_completed_at", { withTimezone: true }),
  step_3_completed_at: timestamp("step_3_completed_at", { withTimezone: true }),
  step_4_completed_at: timestamp("step_4_completed_at", { withTimezone: true }),
  step_5_completed_at: timestamp("step_5_completed_at", { withTimezone: true }),
  onboarding_completed_at: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
})
