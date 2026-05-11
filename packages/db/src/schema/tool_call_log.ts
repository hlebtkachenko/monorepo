/**
 * tool_call_log — central audit for every tool call (FORCE RLS on organization_id).
 *
 * Mirrors: packages/db/migrations/0004_audit.sql (CREATE TABLE tool_call_log)
 *
 * Append-only contract: DELETE + arbitrary UPDATE are blocked by DB triggers.
 * Only output_json, auto_applied, approved_by_user_id, and rationale may be
 * set after insert (limited-update trigger).
 *
 * Columns NOT present: period_id, flow_run_id (accounting/AI deferred).
 */
import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { actorKind } from "./_enums.js"
import { app_user } from "./app_user.js"

export const tool_call_log = pgTable("tool_call_log", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  tool_name: text("tool_name").notNull(),
  idempotency_key: text("idempotency_key").notNull(),
  actor_kind: actorKind("actor_kind").notNull(),
  user_id: uuid("user_id").references(() => app_user.id),
  conversation_id: uuid("conversation_id"),
  input_json: jsonb("input_json").notNull(),
  output_json: jsonb("output_json"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  rationale: text("rationale"),
  auto_applied: boolean("auto_applied").notNull().default(false),
  approved_by_user_id: uuid("approved_by_user_id").references(
    () => app_user.id,
  ),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
