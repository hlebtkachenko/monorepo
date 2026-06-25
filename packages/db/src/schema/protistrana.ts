// protistrana — counterparty stub (§5.7). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const protistrana = pgTable("protistrana", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  nazev: text("nazev"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
