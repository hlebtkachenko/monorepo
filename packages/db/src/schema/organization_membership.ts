/**
 * organization_membership — user <-> organization join model.
 *
 * Mirrors: packages/db/migrations/0005_workspace.sql (CREATE TABLE organization_membership)
 *
 * UNIQUE (organization_id, user_id) enforces one active membership per user per org.
 * The constraint is defined at the table level to match the migration DDL exactly.
 */
import { boolean, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizationRole } from "./_enums"
import { organization } from "./organization"
import { workspace } from "./workspace"
import { workspace_membership } from "./workspace_membership"
import { app_user } from "./app_user"

export const organization_membership = pgTable(
  "organization_membership",
  {
    id: uuid("id")
      .notNull()
      .default(sql`uuidv7()`)
      .primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "cascade" }),
    workspace_membership_id: uuid("workspace_membership_id")
      .notNull()
      .references(() => workspace_membership.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull(),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("organization_membership_org_user_unique").on(
      table.organization_id,
      table.user_id,
    ),
  ],
)
