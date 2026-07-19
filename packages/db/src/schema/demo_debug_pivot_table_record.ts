/**
 * demo_debug_pivot_table_record — demo rows for the Debug → Archetype Table
 * (Pivot Table) reference page in the `/o` tree. Long-format observations
 * (category × month → amount) so the page can pivot them. Same demo contract as
 * `demo_debug_normal_table_record`: dev-only seed, PROD empty, never real data.
 *
 * Naming: `demo_<module>_<type>_record` — clusters by the `demo_` prefix.
 *
 * Mirrors: packages/db/migrations/0067_demo_debug_tables.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0067).
 * Single-col FK: organization_id → organization (tenant root). RLS / grants live
 * in the migration, not this DSL.
 */
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const demo_debug_pivot_table_record = pgTable(
  "demo_debug_pivot_table_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    /** Pivot row dimension. */
    category: text("category").notNull(),
    /** Pivot column dimension — "YYYY-MM". */
    month: text("month").notNull(),
    /** Free-text demo status: "draft" | "posted" | "rejected". */
    status: text("status").notNull(),
    /** Pivot measure (summed). */
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("demo_debug_pivot_table_record_org_category_idx").on(
      t.organization_id,
      t.category,
    ),
  ],
)
