/**
 * two_factor — per-user TOTP/backup-codes.
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE two_factor)
 * + 0014_two_factor_relax_rls.sql (drops FORCE RLS — Better Auth owns
 * access via its signed session cookie, same posture as app_user /
 * auth_account / auth_session / auth_verification).
 */
import { boolean, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"

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
