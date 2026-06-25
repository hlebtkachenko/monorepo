// dilci_zaznam — money decomposition, pre-posting (§33/5). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import { numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { dilciDruh } from "./_enums"
import { money } from "../columns"

export const dilci_zaznam = pgTable("dilci_zaznam", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  doklad_radek_id: uuid("doklad_radek_id").notNull(),
  druh: dilciDruh("druh").notNull(),
  castka: money("castka").notNull(),
  dph_sazba: numeric("dph_sazba", { precision: 5, scale: 2 }),
  dph_castka: money("dph_castka"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
