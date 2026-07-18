/**
 * favorite_page — a user's starred pages within an org. Per-user + per-org: the
 * star is a personal action, scoped to one org by RLS. `page_route` is the
 * org-relative orgHref path (survives org switch + the /o flip), `module_key`
 * groups favorites under a rail module, `label` snapshots the ContentHeader
 * title.
 *
 * Mirrors: packages/db/migrations/0064_favorite_page.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0064).
 * Single-col FKs: organization_id → organization (tenant root) and
 * user_id → app_user (global). RLS / grants live in the migration, not this DSL.
 */
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { organization } from "./organization"

export const favorite_page = pgTable(
  "favorite_page",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "cascade" }),
    page_route: text("page_route").notNull(),
    module_key: text("module_key").notNull(),
    label: text("label").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("favorite_page_org_user_route_unique").on(
      t.organization_id,
      t.user_id,
      t.page_route,
    ),
    index("favorite_page_org_user_module_idx").on(
      t.organization_id,
      t.user_id,
      t.module_key,
      t.sort_order,
    ),
  ],
)
