/**
 * oauth_refresh_token — OAuth 2.1 refresh tokens (Better Auth `oauthProvider`
 * plugin, model `oauthRefreshToken`). BA-owned, global-tier, NO RLS.
 *
 * Mirrors: packages/db/migrations/0066_oauth_provider.sql
 * See jwks.ts for the camelCase-key / snake_case-column convention note.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { auth_session } from "./auth_session"
import { oauth_client } from "./oauth_client"

export const oauth_refresh_token = pgTable("oauth_refresh_token", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  token: text("token").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauth_client.clientId, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => auth_session.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revoked: timestamp("revoked", { withTimezone: true }),
  authTime: timestamp("auth_time", { withTimezone: true }),
  scopes: text("scopes").array().notNull(),
})
