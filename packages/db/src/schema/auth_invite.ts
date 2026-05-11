/**
 * auth_invite — organization-scoped invite (FORCE RLS on organization_id).
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE auth_invite)
 * Organization + workspace FKs wired in 0005_workspace.sql after both tables exist.
 *
 * Design note: `role` is varchar(64) NOT NULL (not enum). App layer validates
 * valid roles; the column is intentionally kept open for future role names
 * without requiring a migration ALTER TYPE.
 *
 * `workspace_id` is NOT NULL: invites are always workspace-scoped.
 */
import { text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { inviteStatus } from "./_enums.js"
import { app_user } from "./app_user.js"

export const auth_invite = pgTable("auth_invite", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  workspace_id: uuid("workspace_id").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  status: inviteStatus("status").notNull().default("pending"),
  issued_by_user_id: uuid("issued_by_user_id").references(() => app_user.id),
  issued_at: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  accepted_by_user_id: uuid("accepted_by_user_id").references(
    () => app_user.id,
  ),
})
