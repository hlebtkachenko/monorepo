/**
 * asset_event — the Karta majetku event history (spec §2.7: "Zařazení/TZ/
 * Vyřazení: datum, částka, poznámka").
 *
 * Mirrors: apps/beta/db/migrations/0008_assets.sql (CREATE TABLE asset_event).
 *
 * `asset_id` carries no `.references()` in this DSL because the real
 * constraint is COMPOSITE — `(asset_id, organization_id)` against `asset`'s
 * own `(id, organization_id)` — the same tenancy-carrying shape as filing's
 * `period_id` / `document_id` in `filing.ts`. The constraint itself lives in
 * the migration, repo convention.
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

import { betaAssetEventKind } from "./_enums"
import { organization } from "./organization"

export const asset_event = pgTable(
  "asset_event",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    asset_id: uuid("asset_id").notNull(),
    kind: betaAssetEventKind("kind").notNull(),
    event_date: date("event_date").notNull(),
    /**
     * Office-typed, nullable: not every event carries a stated amount yet
     * (spec §0.4 — NULL is "not stated", never zero).
     */
    amount: numeric("amount", { precision: 14, scale: 2 }),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_event_asset_idx").on(table.asset_id, table.event_date),
    index("asset_event_organization_idx").on(table.organization_id),
  ],
)
