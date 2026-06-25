// zapis_radek — double-entry posting line, MD/D (§13/2). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accountingRegime, zapisStrana } from "./_enums"
import { money } from "../columns"

export const zapis_radek = pgTable("zapis_radek", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  zapis_id: uuid("zapis_id").notNull(),
  regime: accountingRegime("regime").notNull(),
  ucet_id: uuid("ucet_id").notNull(),
  dilci_id: uuid("dilci_id"),
  strana: zapisStrana("strana").notNull(),
  castka: money("castka").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
