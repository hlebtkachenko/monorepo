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
    rounding_amount: numeric("rounding_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // §37 doc-total rounding -> 548/648 at posting
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "summary_record_org_fk",
      columns: [t.organization_id, t.workspace_id],
      foreignColumns: [organization.id, organization.workspace_id],
    }),
    foreignKey({
      name: "summary_record_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [
        accounting_period.id,
        accounting_period.organization_id,
      ],
    }),
    foreignKey({
      name: "summary_record_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
    unique("summary_record_cislena_rada_unique").on(
      t.number_series_id,
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
