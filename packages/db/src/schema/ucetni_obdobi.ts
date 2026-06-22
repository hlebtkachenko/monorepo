// ucetni_obdobi — accounting period (§3/2, §17). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { date, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ucetniObdobiTyp, ucetniObdobiStav } from "./_enums"

export const ucetni_obdobi = pgTable("ucetni_obdobi", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  typ: ucetniObdobiTyp("typ").notNull(),
  od: date("od").notNull(),
  do: date("do").notNull(),
  stav: ucetniObdobiStav("stav").notNull().default("otevreno"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
