/**
 * agent_key — the credential the office's own ingestion agent authenticates
 * with (spec §3.2 "Agent ingestion API").
 *
 * Mirrors: apps/beta/db/migrations/0011_agent_api.sql (CREATE TABLE agent_key).
 *
 * A key is the NON-INTERACTIVE FORM OF ONE OFFICE USER'S AUTHORITY:
 * `acting_user_id` names the účetní it acts as, and the API resolves the same
 * membership that user's browser session would. `organization_id` narrows it
 * further to one book; NULL is office-global.
 *
 * DB-enforced invariants, all in the migration:
 *   - `agent_key_hash_idx` — one secret, one row; only sha256 is stored.
 *   - trigger `agent_key_acting_user_is_staff` — the acting account must be a
 *     live office account at issuance.
 *   - trigger `agent_key_freeze_identity` — hash, acting user and organization
 *     are immutable, and revocation is final.
 *   - trigger `app_user_disable_revokes_agent_keys` — deactivating the human
 *     revokes the keys in the same transaction.
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  char,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { app_user } from "./app_user"
import { organization } from "./organization"

export const agent_key = pgTable(
  "agent_key",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** NULL = office-global: every book the acting user is účetní of. */
    organization_id: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    /** sha256 of the secret, hex. The secret exists once, at issuance. */
    key_hash: char("key_hash", { length: 64 }).notNull(),
    acting_user_id: uuid("acting_user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "restrict" }),
    created_by_user_id: uuid("created_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Coarse liveness signal; written at most once a minute per key. */
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    revoked_by_user_id: uuid("revoked_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("agent_key_organization_idx").on(
      table.organization_id,
      table.created_at.desc(),
    ),
    index("agent_key_acting_user_idx").on(table.acting_user_id),
  ],
)
