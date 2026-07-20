/**
 * summary_record — souhrnný úč. záznam = voucher/doklad header (§11). Numbered.
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE summary_record)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Composite FKs (org / period / series) mirrored below; the M7 Označení uniqueness
 * per (org, period, type) is the summary_record_oznaceni_unique constraint.
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  bigint,
  date,
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { summaryRecordType } from "./_enums"
import { accounting_period } from "./accounting_period"
import { inbox_item } from "./inbox_item"
import { number_series } from "./number_series"
import { organization } from "./organization"

export const summary_record = pgTable(
  "summary_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    workspace_id: uuid("workspace_id").notNull(),
    period_id: uuid("period_id").notNull(), // the účetní období this voucher books into
    number_series_id: uuid("number_series_id").notNull(), // číselná řada (entity_type = DOCUMENT)
    sequence_number: bigint("sequence_number", { mode: "number" }).notNull(), // gapless position in the série
    designation: text("designation").notNull(), // FROZEN Označení string (gov/audit id)
    type: summaryRecordType("type").notNull(),
    issued_at: timestamp("issued_at", { withTimezone: true }).notNull(), // okamžik vyhotovení (§11/1d)
    tax_point_date: date("tax_point_date"), // DUZP/DPPD; required for complete VAT outputs
    received_date: date("received_date"), // proven document-receipt date for input-VAT eligibility
    rounding_amount: numeric("rounding_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // §37 doc-total rounding -> 548/648 at posting
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Provenance: the approved gated write this row landed from (NULL = human).
    // Composite (inbox_id, workspace_id) FK — RLS-safe (both workspace-scoped).
    inbox_id: uuid("inbox_id"),
  },
  (t) => [
    foreignKey({
      name: "summary_record_inbox_fk",
      columns: [t.inbox_id, t.workspace_id],
      foreignColumns: [inbox_item.id, inbox_item.workspace_id],
    }),
    foreignKey({
      name: "summary_record_org_fk",
      columns: [t.organization_id, t.workspace_id],
      foreignColumns: [organization.id, organization.workspace_id],
    }),
    foreignKey({
      name: "summary_record_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    foreignKey({
      name: "summary_record_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
    // Gapless Označení is unique per (série, PERIOD, sequence): per-period counters
    // (number_series_period) restart at 1, so the série+sequence pair repeats across
    // účetní období. Widened in 0069.
    unique("summary_record_cislena_rada_unique").on(
      t.number_series_id,
      t.period_id,
      t.sequence_number,
    ),
    unique("summary_record_id_org_unique").on(t.id, t.organization_id),
    unique("summary_record_oznaceni_unique").on(
      t.organization_id,
      t.period_id,
      t.type,
      t.designation,
    ),
  ],
)
