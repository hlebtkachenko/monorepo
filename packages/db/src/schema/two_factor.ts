/**
 * two_factor — per-user TOTP/backup-codes (FORCE RLS on app.user_id).
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE two_factor)
 */
import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user.js"

export const two_factor = pgTable("two_factor", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  secret: text("secret").notNull(),
  backup_codes: text("backup_codes").notNull(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(true),
  enabled: boolean("enabled").notNull().default(false),
  enrolled_at: timestamp("enrolled_at", { withTimezone: true }),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
