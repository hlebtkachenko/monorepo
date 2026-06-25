// odpisovy_plan — depreciation plan (§4/11). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { money } from "../columns"

export const odpisovy_plan = pgTable("odpisovy_plan", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  majetek_id: uuid("majetek_id").notNull(),
  metoda: text("metoda").notNull(),
  mesicni_castka: money("mesicni_castka").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
