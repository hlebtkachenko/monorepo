/**
 * audit_event — workspace-tier append-only audit stream.
 *
 * Mirrors: packages/db/migrations/0004_audit.sql (CREATE TABLE audit_event)
 * + 0021_audit_event_workspace_id_nullable.sql (workspace_id NULLABLE).
 * FKs to workspace + organization wired in 0005_workspace.sql.
 *
 * `workspace_id` is NULL for pre-account auth events (failed login of an
 * unknown email, signup probe, magic-link send/consume failure before a
 * session exists). The RLS policies exclude NULL rows from every tenant-
 * bound SELECT; only `withAdminBypass` (BYPASSRLS) can read them.
 *
 * Append-only: UPDATE + DELETE blocked by DB triggers. INSERT-only for app_user.
 */
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"

export const audit_event = pgTable("audit_event", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  workspace_id: uuid("workspace_id"),
  organization_id: uuid("organization_id"),
  actor_user_id: uuid("actor_user_id").references(() => app_user.id),
  action: text("action").notNull(),
  payload: jsonb("payload")
    .notNull()
    .default(sql`'{}'::jsonb`),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
