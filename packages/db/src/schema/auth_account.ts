/**
 * auth_account — global OAuth/password accounts (no RLS).
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE auth_account)
 */
import { text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user.js"

export const auth_account = pgTable("auth_account", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  account_id: text("account_id").notNull(),
  provider_id: text("provider_id").notNull(),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  id_token: text("id_token"),
  access_token_expires_at: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refresh_token_expires_at: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
