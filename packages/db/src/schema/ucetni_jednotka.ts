// ucetni_jednotka — accounting unit / tenant (§1, §4). Mirrors: packages/db/migrations/0024_accounting_enums_core.sql
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accountingRegime } from "./_enums"

export const ucetni_jednotka = pgTable("ucetni_jednotka", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  regime: accountingRegime("regime").notNull(),
  nazev: text("nazev").notNull(),
  ico: varchar("ico", { length: 16 }),
  platce_dph: boolean("platce_dph").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
