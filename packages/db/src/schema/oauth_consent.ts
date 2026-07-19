/**
 * oauth_consent — recorded user consent per (client, user, referenceId) so a
 * returning client skips the consent screen (Better Auth `oauthProvider`
 * plugin, model `oauthConsent`). BA-owned, global-tier, NO RLS.
 *
 * Mirrors: packages/db/migrations/0066_oauth_provider.sql
 * See jwks.ts for the camelCase-key / snake_case-column convention note.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { oauth_client } from "./oauth_client"

export const oauth_consent = pgTable("oauth_consent", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  clientId: text("client_id")
    .notNull()
    .references(() => oauth_client.clientId, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => app_user.id, {
    onDelete: "cascade",
  }),
  referenceId: text("reference_id"),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
