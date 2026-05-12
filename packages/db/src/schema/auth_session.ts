/**
 * auth_session — global session store (no RLS).
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE auth_session)
 */
import { text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"

export const auth_session = pgTable("auth_session", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  impersonated_by: uuid("impersonated_by").references(() => app_user.id),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
