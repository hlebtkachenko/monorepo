/**
 * booking_template — workspace-shared Brain booking-template library (M2.1).
 *
 * Mirrors: packages/db/migrations/0055_booking_template.sql
 *
 * A REVIEWABLE record of a recurring transaction's CONFIRMED accounting
 * treatment. See the migration header and `packages/brain/.brain/constitution.md`
 * §I9 for the full "this is not a write-template" argument.
 *
 * WORKSPACE-scoped (NOT organization-scoped): a recurring counterparty
 * relationship is a workspace fact — it does not change per client book, so
 * one confirmed template is shared across every org in the office. 4
 * command-specific RLS policies on workspace_id land in 0054, so this table is
 * absent from ORGANIZATION_SCOPED_TABLES and present in WORKSPACE_SCOPED_TABLES.
 * UNIQUE(id, workspace_id) is the composite-FK target for org-tier tables that
 * may later reference a template, closing the cross-workspace FK-bypass hole via
 * (booking_template_id, workspace_id). RLS / grants live in the migration, not
 * this DSL.
 *
 * See ADR-0029 "Brain learned state is workspace-scoped".
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace } from "./workspace"

export const booking_template = pgTable(
  "booking_template",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    counterparty_key: text("counterparty_key").notNull(), // IČO or normalized counterparty name
    direction: text("direction").notNull(), // 'RECEIVED' | 'ISSUED'
    supply_kind: text("supply_kind").notNull(), // SupplyKind
    jurisdiction: text("jurisdiction").notNull(), // VatJurisdiction
    signature_fingerprint: text("signature_fingerprint"), // reserved for future drift-aware matching
    confirmed_decision: jsonb("confirmed_decision").notNull(), // serialized PostingDecision
    human_confirmed_at: timestamp("human_confirmed_at", {
      withTimezone: true,
    }), // NULL = unconfirmed, never matchable
    match_count: integer("match_count").notNull().default(0),
    held_count: integer("held_count").notNull().default(0),
    last_reject_at: timestamp("last_reject_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    learned_at: timestamp("learned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    provenance: jsonb("provenance"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("booking_template_id_workspace_unique").on(t.id, t.workspace_id),
  ],
)

export type BookingTemplateRow = typeof booking_template.$inferSelect
