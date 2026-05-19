/**
 * auth_token — unified opaque-token storage (ADR-0022).
 *
 * Mirrors: packages/db/migrations/0017_auth_token.sql
 *
 * Backs every app-issued in-flight token. Only `token_hash`
 * (sha256 hex of the raw afkey-... string) is stored — the raw token
 * never lands on disk. RLS is FORCE default-deny; every read and write
 * goes through `withAdminBypass` (BYPASSRLS via app_admin). See ADR-0022
 * for the threat model, format, and lifecycle.
 */
import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"

/** Token-kind code. New kinds are added here without an ALTER TYPE. */
export type AuthTokenKind = "sig" | "inv" | "lem" | "ons" | "wks"

/** Environment code encoded into the unkeyed checksum derivation. */
export type AuthTokenEnv = "dev" | "stg" | "prd"

/** Lifecycle state. CHECK constraint mirrors this set. */
export type AuthTokenStatus = "pending" | "consumed" | "revoked" | "expired"

export const auth_token = pgTable("auth_token", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  token_hash: text("token_hash").notNull().unique(),
  kind: text("kind").notNull().$type<AuthTokenKind>(),
  env: text("env").notNull().$type<AuthTokenEnv>(),
  payload: jsonb("payload")
    .notNull()
    .default(sql`'{}'::jsonb`)
    .$type<Record<string, unknown>>(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending").$type<AuthTokenStatus>(),
  issued_at: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  issued_to_user_id: uuid("issued_to_user_id").references(() => app_user.id),
  issued_to_ip: text("issued_to_ip"),
  issued_user_agent_hash: text("issued_user_agent_hash"),
  consumed_at: timestamp("consumed_at", { withTimezone: true }),
  consumed_from_ip: text("consumed_from_ip"),
  consumed_user_agent_hash: text("consumed_user_agent_hash"),
})
