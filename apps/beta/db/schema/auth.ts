/**
 * Better Auth storage tables for the beta portal.
 *
 * Mirrors: apps/beta/db/migrations/0000_init.sql (auth_session, auth_account,
 * auth_verification, two_factor).
 *
 * TARGET VERSION: better-auth 1.6.13 — the exact version pinned repo-wide in
 * `pnpm-workspace.yaml` overrides ("Pin 1.6.13: auth-critical, manual bumps
 * only"). The runtime instance that reads these tables is
 * `apps/beta/lib/auth/server.ts`.
 *
 * ADAPTER CONTRACT (implemented in `lib/auth/server.ts`) — the column names
 * here are snake_case, so the drizzleAdapter carries an explicit `fields`
 * remap, exactly as the main app does (packages/auth/src/server.ts:291-360):
 *
 *   user:         { modelName: "app_user",          fields: { emailVerified: "email_verified",
 *                                                             twoFactorEnabled: "two_factor_enabled",
 *                                                             createdAt: "created_at",
 *                                                             updatedAt: "updated_at" } }
 *   session:      { modelName: "auth_session",      fields: { userId: "user_id", expiresAt: "expires_at",
 *                                                             ipAddress: "ip_address", userAgent: "user_agent",
 *                                                             createdAt: "created_at", updatedAt: "updated_at" } }
 *   account:      { modelName: "auth_account",      fields: { userId: "user_id", accountId: "account_id",
 *                                                             providerId: "provider_id", accessToken: "access_token",
 *                                                             refreshToken: "refresh_token", idToken: "id_token",
 *                                                             accessTokenExpiresAt: "access_token_expires_at",
 *                                                             refreshTokenExpiresAt: "refresh_token_expires_at",
 *                                                             createdAt: "created_at", updatedAt: "updated_at" } }
 *   verification: { modelName: "auth_verification", fields: { expiresAt: "expires_at",
 *                                                             createdAt: "created_at", updatedAt: "updated_at" } }
 *   twoFactor:    { modelName: "two_factor",        fields: { userId: "user_id", backupCodes: "backup_codes" } }
 *
 * Also required: `advanced.database.generateId: "uuid"` (every PK here is a
 * uuid column, and Better Auth generates the id on the TS side before handing
 * the row to Drizzle).
 *
 * Absent by design: no `jwks` / `oauth_*` tables (beta is not an OAuth
 * authorization server), no `impersonated_by` on the session (no impersonation
 * surface), no rate-limit table (BA's in-memory limiter is correct for a
 * single-task service; see plan Part 1 — desiredCount is 1).
 */
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
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
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const auth_account = pgTable(
  "auth_account",
  {
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
    /** Credential hash written by Better Auth's own hasher. Never read by app code. */
    password: text("password"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_account_provider_account_unique").on(
      table.provider_id,
      table.account_id,
    ),
  ],
)

export const auth_verification = pgTable("auth_verification", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * TOTP enrollment. Better Auth's twoFactor() plugin owns every write here.
 *
 * The plugin is NOT enabled yet (see `lib/auth/server.ts`): it lands with the
 * enrolment screen in Nastavení › Účet (PR 21), because turning it on before
 * that screen exists would gate owners on a flow they cannot complete.
 * Enforcement ("an owner without 2FA is redirected to enrolment") is
 * layout-level then, not a DB constraint.
 */
export const two_factor = pgTable("two_factor", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => app_user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backup_codes: text("backup_codes").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
