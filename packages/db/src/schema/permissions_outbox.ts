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
  /** op_type column (NOT in payload). DB CHECK constrains to 'write' | 'delete'. */
  op_type: text("op_type").notNull(),
  /**
   * Structured event payload. DB CHECK (migration 0006):
   *   - payload->>'workspace_id' must be a valid uuid string
   *   - payload->>'user' must match ^[a-z][a-z0-9_]*:<uuid>$
   * App-level (drain) additionally requires payload->>'object' + 'relation'
   * and an optional 'condition' { name, context? }. See
   * packages/workers/src/lanes/permissions-drain.ts for the full contract.
   */
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  failed_at: timestamp("failed_at", { withTimezone: true }),
  processed_at: timestamp("processed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
