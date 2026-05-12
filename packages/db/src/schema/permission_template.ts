/**
 * permission_template — reusable bundles of capability keys per workspace.
 *
 * Mirrors: packages/db/migrations/0009_permission_catalog.sql (CREATE TABLE permission_template)
 *
 * Workspace-scoped FORCE RLS. System templates have workspace_id = NULL and
 * is_system = true; workspace templates are scoped to a specific workspace.
 *
 * Two partial unique indexes replace a single UNIQUE (workspace_id, name):
 * NULLs are not equal in unique indexes, so separate indexes are required.
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspaceRole } from "./_enums"
import { workspace } from "./workspace"

export const permission_template = pgTable("permission_template", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  workspace_id: uuid("workspace_id").references(() => workspace.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  base_role: workspaceRole("base_role").notNull(),
  granted_rules: text("granted_rules")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  is_system: boolean("is_system").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
