// penezni_denik_radek — cash book row (§13b / §7b). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accountingRegime, penezniDenikMisto, penezniDenikSmer } from "./_enums"
import { money } from "../columns"

export const penezni_denik_radek = pgTable("penezni_denik_radek", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  zapis_id: uuid("zapis_id").notNull(),
  regime: accountingRegime("regime").notNull(),
  dilci_id: uuid("dilci_id"),
  kategorie_id: uuid("kategorie_id"),
  misto: penezniDenikMisto("misto").notNull(),
  smer: penezniDenikSmer("smer").notNull(),
  danovy: boolean("danovy").notNull(),
  prubezny: boolean("prubezny").notNull().default(false),
  zaklad_dane: money("zaklad_dane"),
  castka: money("castka").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
