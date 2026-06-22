// doklad_radek — voucher line, documents one case (§4/11). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { money } from "../columns"

export const doklad_radek = pgTable("doklad_radek", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  doklad_id: uuid("doklad_id").notNull(),
  pripad_id: uuid("pripad_id").notNull(),
  popis: text("popis"),
  castka: money("castka").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
