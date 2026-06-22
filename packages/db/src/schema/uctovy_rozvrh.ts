// uctovy_rozvrh — chart of accounts (§14, §13/3). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, smallint, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const uctovy_rozvrh = pgTable("uctovy_rozvrh", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  rok: smallint("rok").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
