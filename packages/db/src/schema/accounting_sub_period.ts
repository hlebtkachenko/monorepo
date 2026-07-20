/**
 * accounting_sub_period — the fiscal month/quarter rows that subdivide one účetní
 * období (accounting_period). Foundation for the year -> month tree and the
 * per-slot document-flow padlocks (allow_inbound_documents /
 * allow_outbound_documents) that later waves attach.
 *
 * Mirrors: packages/db/migrations/0081_accounting_sub_period.sql
 *
 * FISCAL grain — a slot is a child of a specific accounting_period, so the parent
 * is a composite (period_id, organization_id) FK, not a calendar pair (that is
 * filing_record's grain). status reuses the shared period_status enum (OPEN |
 * CLOSED). Organization-scoped (FORCE RLS + organization_isolation, applied in
 * 0081). Composite (period_id, organization_id) FK — FK bypasses RLS. UNIQUE(id,
 * organization_id) is the composite-FK target idiom; UNIQUE(organization_id,
 * period_id, slot_index) makes the slot ordinal one-per-period. Triggers / RLS /
 * CHECK constraints live in the migration, not this DSL.
 */
import {
  boolean,
  date,
  foreignKey,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { periodStatus, subPeriodKind } from "./_enums"
import { accounting_period } from "./accounting_period"

export const accounting_sub_period = pgTable(
  "accounting_sub_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(), // parent účetní období
    slot_index: integer("slot_index").notNull(), // 0-based ordinal within the period
    slot_kind: subPeriodKind("slot_kind").notNull(),
    period_start: date("period_start").notNull(),
    period_end: date("period_end").notNull(),
    status: periodStatus("status").notNull().default("OPEN"),
    allow_inbound_documents: boolean("allow_inbound_documents")
      .notNull()
      .default(true), // doklady přijaté padlock
    allow_outbound_documents: boolean("allow_outbound_documents")
      .notNull()
      .default(true), // doklady vydané padlock
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "accounting_sub_period_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    unique("accounting_sub_period_id_org_unique").on(t.id, t.organization_id),
    unique("accounting_sub_period_slot_unique").on(
      t.organization_id,
      t.period_id,
      t.slot_index,
    ),
  ],
)
