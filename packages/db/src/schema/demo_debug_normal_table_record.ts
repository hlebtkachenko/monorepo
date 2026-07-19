/**
 * demo_debug_normal_table_record — demo rows for the Debug → Archetype Table
 * (Normal Table) reference page in the `/o` tree. Purpose-built demo data: it
 * exists ONLY to feed a dev/allowlist-gated reference page, so cloning that page
 * as a template needs no demo-stripping, and PROD stays empty (the seed is
 * localhost-only). Never real product data.
 *
 * Naming: `demo_<module>_<type>_record` — all demo tables cluster by the `demo_`
 * prefix so they are findable + self-identifying.
 *
 * Mirrors: packages/db/migrations/0067_demo_debug_tables.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0067).
 * Single-col FK: organization_id → organization (tenant root). RLS / grants live
 * in the migration, not this DSL.
 */
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const demo_debug_normal_table_record = pgTable(
  "demo_debug_normal_table_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    /** Human document number — the row's display identity column. */
    document: text("document").notNull(),
    partner: text("partner").notNull(),
    /** Free-text demo status: "draft" | "posted" | "rejected". */
    status: text("status").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    issued_on: date("issued_on").notNull(),
    /** Longer per-row detail, surfaced in the row Inspector. */
    note: text("note").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("demo_debug_normal_table_record_org_issued_idx").on(
      t.organization_id,
      t.issued_on,
    ),
  ],
)
