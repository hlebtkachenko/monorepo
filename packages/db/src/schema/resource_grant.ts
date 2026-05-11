/**
 * resource_grant — per-membership / per-resource permission narrowing.
 *
 * Mirrors: packages/db/migrations/0009_permission_catalog.sql (CREATE TABLE resource_grant)
 *
 * Workspace-scoped FORCE RLS (gated via workspace_membership FK).
 * organization_id is nullable: NULL = workspace-tier grant, non-NULL = org-scoped.
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace_membership } from "./workspace_membership.js"
import { organization } from "./organization.js"

export const resource_grant = pgTable("resource_grant", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  membership_id: uuid("membership_id")
    .notNull()
    .references(() => workspace_membership.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  resource_type: text("resource_type").notNull(),
  resource_id: uuid("resource_id"),
  can_view: boolean("can_view").notNull().default(false),
  can_edit: boolean("can_edit").notNull().default(false),
  can_delete: boolean("can_delete").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
