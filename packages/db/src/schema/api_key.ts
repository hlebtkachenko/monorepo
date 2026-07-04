/**
 * api_key — organization-scoped machine-auth credential (FORCE RLS on
 * organization_id).
 *
 * Mirrors: packages/db/migrations/0015_api_key.sql
 *
 * Design note: only `key_hash` (sha256 hex of the raw key) is stored. The raw
 * key is returned once at creation and never persisted — same opaque-token +
 * DB-hash design as auth_invite. `prefix` is a non-secret display fragment
 * (e.g. `affk_live_xxxx`) so a key can be identified in the UI / audit trail.
 *
 * `revoked_at` non-NULL = the key is dead. `expires_at` NULL = non-expiring.
 */
import { text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { organization } from "./organization"
import { workspace } from "./workspace"

export const api_key = pgTable("api_key", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workspace_id: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  key_hash: text("key_hash").notNull().unique(),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // Actor capability of the key: `human` (a person acting through the API) or
  // `agent` (an autonomous Brain client). Agent keys are DENIED server-side on
  // the held-write resolve endpoint (they may propose writes, never approve
  // them). Default `human` keeps every pre-existing key fully capable; a Brain
  // key is provisioned explicitly as `agent`. text+CHECK (migration 0044), not
  // a pgEnum, to stay additive + lock-light (mirrors supply_kind, 0043).
  actor_kind: text("actor_kind").notNull().default("human"),
  created_by_user_id: uuid("created_by_user_id").references(() => app_user.id),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
