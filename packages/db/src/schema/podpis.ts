// podpis — signature record (§33a/4). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { podpisTyp } from "./_enums"

export const podpis = pgTable("podpis", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  doklad_id: uuid("doklad_id"),
  zapis_id: uuid("zapis_id"),
  typ: podpisTyp("typ").notNull(),
  podepsal: uuid("podepsal").notNull(),
  okamzik: timestamp("okamzik", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
