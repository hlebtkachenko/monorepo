/**
 * permission_rule — global catalog of capability keys (no RLS).
 *
 * Mirrors: packages/db/migrations/0009_permission_catalog.sql (CREATE TABLE permission_rule)
 *
 * Global catalog; no RLS. SELECT for app_user; INSERT/UPDATE/DELETE via app_admin.
 * Key shape: dotted-lowercase namespace (e.g. workspace.members.view).
 */
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const permission_rule = pgTable("permission_rule", {
  key: text("key").primaryKey(),
  label: text("label"),
  category: text("category"),
  resource_type: text("resource_type"),
  action: text("action").notNull(),
  legacy: boolean("legacy").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
