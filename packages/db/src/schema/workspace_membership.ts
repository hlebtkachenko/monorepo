/**
 * workspace_membership — user <-> workspace with role + active flag.
 *
 * Mirrors: packages/db/migrations/0005_workspace.sql (CREATE TABLE workspace_membership)
 * mfa_grace_until added in 0011_onboarding.sql.
 *
 * Partial unique: one active row per (workspace_id, user_id). Allows multiple
 * inactive rows (handled by DB-level partial unique index, not Drizzle unique()).
 */
import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspaceRole } from "./_enums"
import { workspace } from "./workspace"
import { app_user } from "./app_user"

export const workspace_membership = pgTable("workspace_membership", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  workspace_id: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  role: workspaceRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  // mfa_grace_until: added in migration 0011_onboarding.sql
  mfa_grace_until: timestamp("mfa_grace_until", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
