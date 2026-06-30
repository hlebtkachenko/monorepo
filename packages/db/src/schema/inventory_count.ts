/**
 * inventory_count — inventurní soupis (ZoÚ §29–30). Below books; differences generate
 * postings. Append-only at migration. Označení (D6).
 *
 * Mirrors: packages/db/migrations/0030_accounting_supporting.sql (CREATE TABLE inventory_count)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  bigint,
  date,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { number_series } from "./number_series"
import { organization } from "./organization"

export const inventory_count = pgTable(
  "inventory_count",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    number_series_id: uuid("number_series_id").notNull(), // Označení series (entity_type = INVENTORY_COUNT)
    sequence_number: bigint("sequence_number", { mode: "number" }).notNull(),
    designation: text("designation").notNull(), // FROZEN soupis č.
    count_date: date("count_date").notNull(), // datum inventury (§30/2)
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("inventory_count_id_org_unique").on(t.id, t.organization_id),
    unique("inventory_count_oznaceni_unique").on(
      t.number_series_id,
      t.sequence_number,
    ),
    foreignKey({
      name: "inventory_count_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
  ],
)
