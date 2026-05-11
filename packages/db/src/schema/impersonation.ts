/**
 * impersonation — workspace-tier audit envelope for admin impersonation sessions.
 *
 * Mirrors: packages/db/migrations/0010_impersonation.sql (CREATE TABLE impersonation)
 *
 * Better Auth owns the live session via auth_session.impersonated_by; this table
 * records the start/end window for compliance + SLA reporting.
 *
 * app_user cannot INSERT/UPDATE/DELETE; every lifecycle mutation goes through
 * withAdminBypass from the admin console route handler.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace } from "./workspace.js"
import { organization } from "./organization.js"
import { app_user } from "./app_user.js"
import { auth_session } from "./auth_session.js"

export const impersonation = pgTable("impersonation", {
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`)
    .primaryKey(),
  workspace_id: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  actor_user_id: uuid("actor_user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "restrict" }),
  target_user_id: uuid("target_user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  auth_session_id: uuid("auth_session_id").references(() => auth_session.id, {
    onDelete: "set null",
  }),
  started_at: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
  expected_end_at: timestamp("expected_end_at", {
    withTimezone: true,
  }).notNull(),
})
