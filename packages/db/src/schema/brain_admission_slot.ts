/**
 * brain_admission_slot — cross-instance concurrent-run admission caps.
 *
 * Mirrors: packages/db/migrations/0063_brain_admission_slot.sql
 *
 * Shared-state backing table for the Brain write-lane admission controller
 * (`DbAdmissionController`, packages/db/src/admission.ts). Each admitted run
 * holds one `scope='global'` row + one `scope='org'` row; `acquire` counts live
 * rows across all API instances inside one advisory-locked transaction to
 * enforce the global + per-org caps that the in-memory controller can only
 * enforce per-process. See ADR-0028 §Decision.1 + #472.
 *
 * NO RLS (deliberate — the ONE Brain-adjacent table without it): an
 * infrastructure / admin-plane table, not tenant data. RLS keyed on
 * `app.organization_id` would break the GLOBAL count (a run must see every
 * instance's rows across all orgs). Access is bounded by GRANTs (app_user +
 * app_admin). RLS / grants live in the migration, not this DSL. Absent from
 * ORGANIZATION_SCOPED_TABLES and WORKSPACE_SCOPED_TABLES.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const brain_admission_slot = pgTable("brain_admission_slot", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(),
  scope_key: text("scope_key").notNull(),
  instance_id: text("instance_id").notNull(),
  acquired_at: timestamp("acquired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  heartbeat_at: timestamp("heartbeat_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type BrainAdmissionSlotRow = typeof brain_admission_slot.$inferSelect
