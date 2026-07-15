/**
 * tool_call_log — central audit for every tool call (FORCE RLS on organization_id).
 *
 * Mirrors: packages/db/migrations/0004_audit.sql (CREATE TABLE tool_call_log)
 * and 0059_tool_call_log_period.sql (period-scoped accounting proposals).
 *
 * Append-only contract: DELETE + arbitrary UPDATE are blocked by DB triggers.
 * Only output_json, auto_applied, approved_by_user_id, and rationale may be
 * set after insert (limited-update trigger).
 *
 * Column NOT present: flow_run_id (accounting/AI deferred).
 */
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { actorKind } from "./_enums"
import { accounting_period } from "./accounting_period"
import { app_user } from "./app_user"

export const tool_call_log = pgTable(
  "tool_call_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id"),
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
  },
  (t) => [
    foreignKey({
      name: "tool_call_log_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    index("tool_call_log_organization_period_pending_idx")
      .on(t.organization_id, t.period_id, t.created_at)
      .where(
        sql`${t.auto_applied} = false AND ${t.approved_by_user_id} IS NULL`,
      ),
  ],
)
