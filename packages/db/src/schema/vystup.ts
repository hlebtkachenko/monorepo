// vystup — period output marker (§18 / §13b/3 / §7b). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { vystupTyp } from "./_enums"

export const vystup = pgTable("vystup", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  obdobi_id: uuid("obdobi_id").notNull(),
  typ: vystupTyp("typ").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
