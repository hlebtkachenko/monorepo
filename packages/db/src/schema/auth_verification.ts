/**
 * auth_verification — global token store with optional workspace binding.
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE auth_verification)
 * workspace_id FK wired in 0005_workspace.sql after workspace table exists.
 */
import { text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const auth_verification = pgTable("auth_verification", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  // nullable: Better Auth's own writers leave NULL; workspace_id FK added in 0005
  workspace_id: uuid("workspace_id"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
