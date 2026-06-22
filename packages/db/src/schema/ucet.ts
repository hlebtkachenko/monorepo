// ucet — account in a chart (§16). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ucetTyp } from "./_enums"

export const ucet = pgTable("ucet", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  rozvrh_id: uuid("rozvrh_id").notNull(),
  parent_id: uuid("parent_id"),
  cislo: text("cislo").notNull(),
  trida: smallint("trida").notNull(),
  typ: ucetTyp("typ").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
