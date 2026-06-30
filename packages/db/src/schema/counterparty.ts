/**
 * counterparty — workspace-shared protistrana; self-of-org identity row.
 *
 * Mirrors: packages/db/migrations/0026_accounting_organization_reshape.sql (CREATE TABLE counterparty)
 *
 * WORKSPACE-scoped (NOT organization-scoped): 4 command-specific RLS policies on
 * workspace_id land in 0034, so this table is intentionally absent from
 * ORGANIZATION_SCOPED_TABLES.
 * UNIQUE(id, workspace_id) is the composite-FK target for org-tier tables that
 * reference a counterparty (accounting_event, open_item), closing the
 * cross-workspace FK-bypass hole via (counterparty_id, workspace_id).
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"
import { workspace } from "./workspace"

export const counterparty = pgTable(
  "counterparty",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    self_of_organization_id: uuid("self_of_organization_id")
      .unique()
      .references(() => organization.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("counterparty_id_workspace_unique").on(t.id, t.workspace_id)],
)
