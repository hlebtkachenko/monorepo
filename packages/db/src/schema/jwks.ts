/**
 * jwks — Better Auth `jwt()` plugin key store (asymmetric signing keys for
 * OAuth/OIDC access tokens). BA-owned, global-tier, NO RLS — access is via the
 * server-side auth flow only, same posture as auth_session / two_factor.
 *
 * Mirrors: packages/db/migrations/0066_oauth_provider.sql
 *
 * Column convention note (applies to every oauth_* / jwks table): the Drizzle
 * JS keys are camelCase to match Better Auth's own field vocabulary, so the
 * drizzle adapter needs no per-field remap for these plugin models. The SQL
 * column names (first arg) stay snake_case to honour the DB convention.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const jwks = pgTable("jwks", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
})
