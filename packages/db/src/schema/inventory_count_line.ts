/**
 * inventory_count_line — položka soupisu (D7): one counted item, book vs actual.
 *
 * Mirrors: packages/db/migrations/0031_accounting_supporting.sql (CREATE TABLE inventory_count_line)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * The difference_kind ↔ (actual vs book) consistency CHECK lives in the migration,
 * not this DSL.
 */
import {
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { inventoryDifference } from "./_enums"
import { asset } from "./asset"
import { inventory_count } from "./inventory_count"
import { organization } from "./organization"

export const inventory_count_line = pgTable(
  "inventory_count_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    inventory_count_id: uuid("inventory_count_id").notNull(),
    asset_id: uuid("asset_id"), // counted asset; NULL for stock/cash
    description: text("description").notNull(),
    book_value: numeric("book_value", { precision: 19, scale: 4 }).notNull(), // účetní stav
    actual_value: numeric("actual_value", {
      precision: 19,
      scale: 4,
    }).notNull(), // skutečný stav
    difference_kind: inventoryDifference("difference_kind").notNull(), // sign(actual − book)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("inventory_count_line_id_org_unique").on(t.id, t.organization_id),
    foreignKey({
      name: "inventory_count_line_count_fk",
      columns: [t.inventory_count_id, t.organization_id],
      foreignColumns: [inventory_count.id, inventory_count.organization_id],
    }),
    foreignKey({
      name: "inventory_count_line_asset_fk",
      columns: [t.asset_id, t.organization_id],
      foreignColumns: [asset.id, asset.organization_id],
    }),
  ],
)
