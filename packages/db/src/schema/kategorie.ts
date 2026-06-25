// kategorie — peněžní deník category split (§9). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { kategorieTyp } from "./_enums"

export const kategorie = pgTable("kategorie", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  typ: kategorieTyp("typ").notNull(),
  nazev: text("nazev").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
