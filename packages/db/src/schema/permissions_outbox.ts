/**
 * permissions_outbox — cross-tenant outbox for permission sync (no RLS by design).
 *
 * Mirrors: packages/db/migrations/0006_permissions_outbox.sql
 *
 * No RLS: the drain worker reads across all workspaces and must not be scoped
 * to a single workspace GUC. Intentional exception to the RLS policy.
 *
 * app_user INSERT only; app_worker SELECT + UPDATE.
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const permissions_outbox = pgTable("permissions_outbox", {
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`)
    .primaryKey(),
  op_type: text("op_type").notNull(),
  /** Structured event payload. DB CHECK: payload ? 'op' AND payload ? 'subject_id'. Validated at insert time by app_worker before processing. */
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  failed_at: timestamp("failed_at", { withTimezone: true }),
  processed_at: timestamp("processed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
