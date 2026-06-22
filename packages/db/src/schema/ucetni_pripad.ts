// ucetni_pripad — economic fact / case (§6/1). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const ucetni_pripad = pgTable("ucetni_pripad", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  protistrana_id: uuid("protistrana_id"),
  popis: text("popis").notNull(),
  datum_uskutecneni: date("datum_uskutecneni").notNull(),
  typ: text("typ"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
