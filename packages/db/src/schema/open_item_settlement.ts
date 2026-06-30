/**
 * open_item_settlement — one payment -> obligation match (párování). M:N.
 *
 * Mirrors: packages/db/migrations/0031_accounting_saldokonto.sql (CREATE TABLE open_item_settlement)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Append-only: a match is corrected by a NEW match, never edited; a negative amount =
 * rozpárování / correction. Triggers / RLS / CHECK constraints (amount <> 0) live in
 * the migration, not this DSL.
 */
import {
  date,
  foreignKey,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { open_item } from "./open_item"
import { posting } from "./posting"

export const open_item_settlement = pgTable(
  "open_item_settlement",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    open_item_id: uuid("open_item_id").notNull(), // the obligation being settled
    settling_posting_id: uuid("settling_posting_id").notNull(), // the payment posting (bank/cash, §13b)
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(), // applied amount; negative = rozpárování
    settlement_date: date("settlement_date").notNull(), // datum úhrady
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("open_item_settlement_id_org_unique").on(t.id, t.organization_id),
    foreignKey({
      name: "open_item_settlement_item_fk",
      columns: [t.open_item_id, t.organization_id],
      foreignColumns: [open_item.id, open_item.organization_id],
    }),
    foreignKey({
      name: "open_item_settlement_posting_fk",
      columns: [t.settling_posting_id, t.organization_id],
      foreignColumns: [posting.id, posting.organization_id],
    }),
  ],
)
