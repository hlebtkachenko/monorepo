/**
 * oauth_access_token — OAuth 2.1 access-token records (Better Auth
 * `oauthProvider` plugin, model `oauthAccessToken`). BA-owned, global-tier,
 * NO RLS. The signed JWT is what clients present; this row is the server-side
 * bookkeeping / revocation handle.
 *
 * Mirrors: packages/db/migrations/0066_oauth_provider.sql
 * See jwks.ts for the camelCase-key / snake_case-column convention note.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { auth_session } from "./auth_session"
import { oauth_client } from "./oauth_client"
import { oauth_refresh_token } from "./oauth_refresh_token"

export const oauth_access_token = pgTable("oauth_access_token", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  token: text("token").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauth_client.clientId, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => auth_session.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id").references(() => app_user.id, {
    onDelete: "cascade",
  }),
  referenceId: text("reference_id"),
  refreshId: uuid("refresh_id").references(() => oauth_refresh_token.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  scopes: text("scopes").array().notNull(),
})
