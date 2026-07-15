/**
 * individual_record — jednotlivý úč. záznam; one line, links event <-> voucher.
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE individual_record)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Composite FKs to summary_record (the voucher) and accounting_event (the fact)
 * mirrored below. Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accounting_event } from "./accounting_event"
import { organization } from "./organization"
import { summary_record } from "./summary_record"

export const individual_record = pgTable(
  "individual_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    summary_record_id: uuid("summary_record_id").notNull(), // which voucher
    accounting_event_id: uuid("accounting_event_id").notNull(), // which fact
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Provenance: approved gated write this row landed from (NULL = human). BARE
    // uuid, NO FK — org-only table; a FK to workspace-scoped inbox_item bypasses RLS.
    inbox_id: uuid("inbox_id"),
  },
  (t) => [
    foreignKey({
      name: "individual_record_doc_fk",
      columns: [t.summary_record_id, t.organization_id],
      foreignColumns: [summary_record.id, summary_record.organization_id],
    }),
    foreignKey({
      name: "individual_record_event_fk",
      columns: [t.accounting_event_id, t.organization_id],
      foreignColumns: [accounting_event.id, accounting_event.organization_id],
    }),
    unique("individual_record_id_org_unique").on(t.id, t.organization_id),
  ],
)
