/**
 * loan — the Úvěry a leasingy register (spec §2.4 Finance's fifth sidebar leaf,
 * §4 data model).
 *
 * Mirrors: apps/beta/db/migrations/0017_loans.sql (CREATE TABLE loan).
 *
 * SHALLOW BY DESIGN (spec depth map: "Úvěry ... table + stamp suffices") and
 * MANUAL by design: §3.2's agent ingestion datasets do not include loans, so
 * there is no `import_batch_id` and no `external_ref` here — a loan schedule
 * lives in a contract, not in the office's accounting export.
 *
 * IT COMPUTES NOTHING. `balance` is the office's own restatement of the
 * zůstatek and it always travels with `balance_as_of`; this table never rolls a
 * balance forward by the installments that have fallen due since (spec §0.4,
 * the same rule `asset.depreciation_as_of` follows).
 *
 * DB-enforced invariants, all in the migration:
 *   - `loan_balance_stamp_coherence` — the zůstatek and its as-of date travel
 *     together or not at all.
 *   - `loan_installment_coherence` — splátka and frekvence, likewise.
 *   - `loan_interest_rate_range` — a percent, 0-100, never a fraction.
 *   - trigger `loan_freeze_organization_id` — a loan never changes books.
 *   - trigger `loan_touch_updated_at` — `updated_at` is the row's own freshness
 *     stamp, distinct from `balance_as_of`.
 */
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaLoanInstallmentPeriod, betaLoanKind } from "./_enums"
import { organization } from "./organization"

export const loan = pgTable(
  "loan",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Instituce — the bank or leasing company, as the contract names it. */
    institution: text("institution").notNull(),
    loan_kind: betaLoanKind("loan_kind").notNull(),
    /**
     * Jistina. `numeric(14,2)` (spec §0.7), read as a STRING and never as a
     * JavaScript number.
     */
    principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
    /**
     * Zůstatek. Office-typed, NEVER derived — see the file header. Paired with
     * `balance_as_of` by `loan_balance_stamp_coherence`.
     */
    balance: numeric("balance", { precision: 14, scale: 2 }),
    /** The office's own as-of date for `balance`. Never "today" (spec §0.4). */
    balance_as_of: date("balance_as_of"),
    /** Splátka. NULL is "not stated" — a kontokorent has no fixed one. */
    installment: numeric("installment", { precision: 14, scale: 2 }),
    installment_period: betaLoanInstallmentPeriod("installment_period"),
    /** Úrok in percent: `4.125` is 4,125 %, not a fraction. */
    interest_rate_pct: numeric("interest_rate_pct", {
      precision: 6,
      scale: 3,
    }),
    /** Konec. Nullable — a kontokorent is typically open-ended. */
    ends_on: date("ends_on"),
    /** Client-visible note. Rendered in the portal. */
    note_client: text("note_client"),
    /**
     * Office-internal note. NEVER serialized to a client — the name is already
     * on `CLIENT_FORBIDDEN_COLUMNS` (shared with `filing.note_internal`).
     */
    note_internal: text("note_internal"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The row's own freshness stamp — distinct from `balance_as_of`. */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("loan_organization_institution_idx").on(
      table.organization_id,
      table.institution,
    ),
  ],
)
