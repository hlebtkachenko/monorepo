/**
 * payroll_summary — one period's payroll aggregates (spec §2.6 Přehled mezd, §4
 * data model).
 *
 * Mirrors: apps/beta/db/migrations/0016_payroll.sql (CREATE TABLE
 * payroll_summary).
 *
 * A BATCH PAYLOAD TABLE, like `statement_line` — keyed per `import_batch`, with
 * `period_id` denormalised and the rows frozen once the batch leaves draft. The
 * migration's header explains why in full: spec §3.2 makes payroll one of the
 * five uzávěrka datasets, and supersession / rollback / freshness are properties
 * of `import_batch`, not of a per-period upsert. `payroll_summary_batch_unique`
 * composed with `import_batch_one_published_idx` is spec §4's "period_id unique"
 * for every row a client can see.
 *
 * IT COMPUTES NOTHING (spec §0.2). `employer_cost_total` is NOT gross plus the
 * employer levies, `net_paid_total` is NOT gross minus withholdings, and
 * `payment_due_date` is NOT a period end plus twenty days. The odvody rates the
 * client reads on Přehled mezd (zaměstnavatel 24,8 % + 9 %; sráženo 7,1 % +
 * 4,5 % + záloha na daň) are context for checking the figures, never an
 * arithmetic this application performs.
 *
 * The concept spec §2.6 spells "celkové náklady na zaměstnance" is
 * `employer_cost_total`. It is never called "superhrubá mzda" — that tax base
 * was abolished for the 2021 tax year and using its name would state a defunct
 * rule as the current one.
 *
 * EVERY FIGURE IS NULLABLE. An absent total is not a zero (spec §0.4): 0 Kč of
 * sociální pojištění is a claim about the client's obligations this product
 * would be inventing.
 *
 * DB-enforced invariants, all in the migration:
 *   - `payroll_summary_batch_unique` — one summary per batch.
 *   - `payroll_summary_headcounts_nonnegative`.
 *   - `payroll_summary_batch_fk` / `payroll_summary_period_fk` — composite,
 *     tenancy-carrying; CASCADE with the batch, RESTRICT on the period.
 *   - trigger `payroll_summary_requires_draft_batch` — published payload frozen,
 *     and `period_id` must equal its batch's.
 *   - trigger `payroll_summary_matches_dataset` — only inside a `payroll` batch.
 *   - trigger `payroll_summary_freeze_organization_id`.
 */
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const payroll_summary = pgTable(
  "payroll_summary",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    import_batch_id: uuid("import_batch_id").notNull(),
    period_id: uuid("period_id").notNull(),
    /** Hrubé mzdy celkem. `numeric(14,2)` (§0.7), read as a STRING. */
    gross_total: numeric("gross_total", { precision: 14, scale: 2 }),
    /** Odvody zaměstnavatele — sociální (24,8 %), as stated not as derived. */
    employer_social: numeric("employer_social", { precision: 14, scale: 2 }),
    /** Odvody zaměstnavatele — zdravotní (9 %), as stated not as derived. */
    employer_health: numeric("employer_health", { precision: 14, scale: 2 }),
    /** "Celkové náklady na zaměstnance" (spec §2.6). Never "superhrubá". */
    employer_cost_total: numeric("employer_cost_total", {
      precision: 14,
      scale: 2,
    }),
    /** Sráženo zaměstnancům (sociální + zdravotní), one total per spec §4. */
    employee_withholdings_total: numeric("employee_withholdings_total", {
      precision: 14,
      scale: 2,
    }),
    /** Záloha na daň z příjmů ze závislé činnosti. */
    income_tax_advance: numeric("income_tax_advance", {
      precision: 14,
      scale: 2,
    }),
    /**
     * Čistá vyplacená celkem (Advisor F14) — what actually left the bank
     * account. Its own column because it is not reconstructible from the others:
     * srážky, exekuce and benefits all sit between gross and net.
     */
    net_paid_total: numeric("net_paid_total", { precision: 14, scale: 2 }),
    /** The payroll payment's due date (Advisor F14). Office-stated, never derived. */
    payment_due_date: date("payment_due_date"),
    /** Spec §2.6: "headcount HPP/DPČ/DPP" — the office's number, not a COUNT(*). */
    headcount_hpp: integer("headcount_hpp"),
    headcount_dpc: integer("headcount_dpc"),
    headcount_dpp: integer("headcount_dpp"),
    /**
     * Spec §4 spells this `note`; named `note_client` here so its visibility is
     * stated rather than inferred (every other note in this database is one half
     * of an explicit `note_client` / `note_internal` pair). The office's own
     * "why I re-imported" note lives on `import_batch.note_internal`.
     */
    note_client: text("note_client"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("payroll_summary_batch_unique").on(table.import_batch_id),
    index("payroll_summary_period_idx").on(
      table.organization_id,
      table.period_id,
    ),
  ],
)
