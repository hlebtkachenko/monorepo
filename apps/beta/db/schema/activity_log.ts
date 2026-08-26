/**
 * activity_log — who did what in a book (spec §4).
 *
 * Mirrors: apps/beta/db/migrations/0011_agent_api.sql (CREATE TABLE
 * activity_log).
 *
 * ONE ROW PER API CALL, written inside the same transaction as the mutation it
 * describes: a rolled-back write leaves no row, and a row is proof the write
 * committed. `request_id` is the caller's `Idempotency-Key`, and the partial
 * unique index over (agent_key_id, request_id) is what turns a retried call into
 * a replay instead of a second import.
 *
 * DB-enforced invariants, all in the migration:
 *   - `activity_log_actor_coherence` — an agent act always names its key, a user
 *     act never does.
 *   - `activity_log_agent_request_idx` — one request id per key, once.
 *   - trigger `activity_log_is_append_only` — UPDATE is refused; DELETE stays
 *     available so an organization delete can cascade.
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaActorKind } from "./_enums"
import { agent_key } from "./agent_key"
import { app_user } from "./app_user"
import { organization } from "./organization"

export const activity_log = pgTable(
  "activity_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actor_kind: betaActorKind("actor_kind").notNull(),
    /** For an agent act, the key's own `acting_user_id`. */
    actor_user_id: uuid("actor_user_id").references(() => app_user.id, {
      onDelete: "set null",
    }),
    /** No ON DELETE action — see the migration for why NO ACTION is the only
     * correct one of the four here. */
    agent_key_id: uuid("agent_key_id").references(() => agent_key.id),
    /** `<entity>.<verb>`, e.g. `filing.upsert`. */
    action: text("action").notNull(),
    entity_kind: text("entity_kind").notNull(),
    /** The one row touched, when there was exactly one. */
    entity_id: uuid("entity_id"),
    /** The caller's `Idempotency-Key`. */
    request_id: text("request_id"),
    /** Counts, refs and ids — never the accounting payload, never a secret. */
    summary: jsonb("summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_log_organization_idx").on(
      table.organization_id,
      table.created_at.desc(),
    ),
  ],
)
