/**
 * brain_confident_wrong — the persisted half of constitution §I8.
 *
 * Mirrors: packages/db/migrations/0050_brain_confident_wrong.sql
 *
 * The durable confident-wrong counter + circuit-breaker state. A confident-wrong
 * (a write that read GREEN yet was WRONG — the cardinal sin) increments
 * `confident_wrong_count`; while it is > 0 the write gate REFUSES every
 * autonomous write until a human clears it.
 *
 * WORKSPACE-scoped (a confident-wrong is a calibration failure, and calibration
 * is workspace-scoped — ADR-0029). `workspace_id` is the PRIMARY KEY: one row
 * per workspace, and the ON CONFLICT upsert target for the increment seam. 4
 * command-specific RLS policies on workspace_id land in 0050, so this table is
 * absent from ORGANIZATION_SCOPED_TABLES and present in WORKSPACE_SCOPED_TABLES.
 * RLS / grants live in the migration, not this DSL.
 *
 * See ADR-0029 "Brain learned state is workspace-scoped" + constitution §I8.
 */
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace } from "./workspace"

export const brain_confident_wrong = pgTable("brain_confident_wrong", {
  workspace_id: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id),
  confident_wrong_count: integer("confident_wrong_count").notNull().default(0),
  last_incident_at: timestamp("last_incident_at", { withTimezone: true }),
  // Provenance pointer (NO FK — tool_call_log is org-scoped; a workspace→org FK
  // would bypass RLS). Which auto-applied write was marked confidently wrong.
  last_incident_tool_call_log_id: uuid("last_incident_tool_call_log_id"),
  last_incident_note: text("last_incident_note"),
  cleared_at: timestamp("cleared_at", { withTimezone: true }),
  cleared_by_user_id: uuid("cleared_by_user_id"),
  cleared_note: text("cleared_note"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type BrainConfidentWrongRow = typeof brain_confident_wrong.$inferSelect
