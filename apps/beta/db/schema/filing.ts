/**
 * filing — ONE registry behind all five Daně a podání families.
 *
 * Mirrors: apps/beta/db/migrations/0005_filings.sql (CREATE TABLE filing).
 *
 * Spec §2.3 is explicit that Souhrn / DPH / Daň z příjmů / Mzdové odvody a
 * hlášení / Ostatní are VIEWS over one table, and §2.4 makes Finance › Dluhy a
 * platby a sixth view over the same rows. Nothing here is family-specific, and
 * no family column exists: the mapping lives once, in the SQL function
 * `beta_filing_family(kind)`, and `lib/data/filings.ts` reads it back off the
 * row.
 *
 * Neither `period_id` nor `document_id` carries a `.references()` in this DSL,
 * because both real constraints are COMPOSITE — `(x_id, organization_id)`
 * against the referenced table's own `(id, organization_id)` — which is what
 * makes a cross-tenant reference unrepresentable rather than merely unwritten.
 * Drizzle can express a composite FK in the table extras, but the constraints
 * are declared in the migration like every other one in this app; declaring
 * them in both places would put the ON DELETE rules in two files.
 *
 * DB-enforced invariants, all in the migration:
 *   - `filing_period_fk` — composite, tenancy-carrying, ON DELETE RESTRICT.
 *   - `filing_document_fk` — composite, tenancy-carrying, ON DELETE
 *     SET NULL (document_id): a document is soft-deleted in normal operation,
 *     so a hard delete is an org cascade or PR 37's purge, and the filing is
 *     the record that survives it.
 *   - `filing_filed_coherence` — `planned` ⟺ no `filed_on`.
 *   - `filing_paid_requires_amount` — no payment of an unstated amount.
 *   - `filing_variable_symbol_digits` — VS is 1-10 digits.
 *   - trigger `filing_freeze_organization_id` — a filing never changes books.
 *   - trigger `filing_touch_updated_at` — `updated_at` is the §2.4 source stamp.
 */
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaFilingKind, betaFilingStatus } from "./_enums"
import { organization } from "./organization"

export const filing = pgTable(
  "filing",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: betaFilingKind("kind").notNull(),
    period_id: uuid("period_id").notNull(),
    /** The statutory deadline. */
    due_on: date("due_on").notNull(),
    status: betaFilingStatus("status").notNull().default("planned"),
    /** The day it was ACTUALLY filed — §2.3's "due vs filed". */
    filed_on: date("filed_on"),
    /**
     * Money, `numeric(14,2)` (spec §0.7), read as a STRING and never as a
     * JavaScript number. Sign-carrying: positive = the client owes it, negative
     * = a refund is owed to the client (a DPH nadměrný odpočet is the ordinary
     * case for a construction s.r.o. on reverse charge). NULL means the office
     * has not stated an amount, which is not the same as zero (§0.4).
     */
    amount_due: numeric("amount_due", { precision: 14, scale: 2 }),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    /** Variabilní symbol for the payment (§2.4 row shape). */
    variable_symbol: varchar("variable_symbol", { length: 10 }),
    /**
     * Attachment linkage (§2.3: "attachments (p7s/PDF/XML)"), constrained by
     * the composite `filing_document_fk`. Never serialized: `FilingView`
     * reports `hasAttachment: boolean`, computed against the SAME visibility
     * filters `lib/data/documents.ts` applies, so a soft-deleted or
     * office-hidden attachment reads as absent rather than as a link that 404s.
     */
    document_id: uuid("document_id"),
    /** Client-visible note. Rendered in the portal. */
    note_client: text("note_client"),
    /**
     * Office-internal note. NEVER serialized to a client — the name is on
     * `CLIENT_FORBIDDEN_COLUMNS` and no projection carries it.
     */
    note_internal: text("note_internal"),
    /**
     * The source system's own id, added by 0011 so the agent ingestion API can
     * UPSERT rather than duplicate. NULL on every office-typed row; unique per
     * organization when set (`filing_external_ref_idx`). Office-internal, and on
     * `CLIENT_FORBIDDEN_COLUMNS`.
     */
    external_ref: text("external_ref"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The freshness stamp of the filing source (§2.4). */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("filing_organization_kind_idx").on(table.organization_id, table.kind),
    index("filing_organization_due_idx").on(
      table.organization_id,
      table.due_on,
    ),
    index("filing_organization_period_idx").on(
      table.organization_id,
      table.period_id,
    ),
  ],
)
