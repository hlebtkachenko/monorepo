// ucetni_doklad — source document / voucher (§11). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ucetniDokladTyp } from "./_enums"

export const ucetni_doklad = pgTable("ucetni_doklad", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  obdobi_id: uuid("obdobi_id").notNull(),
  protistrana_id: uuid("protistrana_id"),
  typ: ucetniDokladTyp("typ").notNull(),
  oznaceni: text("oznaceni").notNull(),
  okamzik_vyhotoveni: timestamp("okamzik_vyhotoveni", {
    withTimezone: true,
  }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
