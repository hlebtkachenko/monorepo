/**
 * payroll_employee_line — one employee's figures for one period (spec §2.6
 * Zaměstnanci: "per-employee monthly lines (hrubá, srážky, čistá, náklad)", §4
 * data model).
 *
 * Mirrors: apps/beta/db/migrations/0016_payroll.sql (CREATE TABLE
 * payroll_employee_line).
 *
 * A BATCH PAYLOAD TABLE, same as `payroll_summary` — see that file's header and
 * the migration's for why payroll rides the import spine rather than being a
 * per-period upsert. `payroll_employee_line_identity_unique` composed with
 * `import_batch_one_published_idx` is spec §4's "unique employee+period" for
 * every row a client can see.
 *
 * THIS IS THE TABLE THE EMPLOYEE SEAT NARROWS (spec §2.6.1, §5). Every read of
 * it runs through `payrollScope()` in `lib/data/payroll.ts`, which answers "all"
 * for a management seat and "none" for an unlinked guest today, and gains its
 * third arm — one `payroll_employee_id` — when the employee seat lands.
 *
 * Four figures, none derived from the others (spec §0.2).
 *
 * DB-enforced invariants, all in the migration:
 *   - `payroll_employee_line_identity_unique` — one line per employee per batch.
 *   - `payroll_employee_line_employee_fk` — composite, ON DELETE RESTRICT: an
 *     employee with payroll history is not removable out from under it.
 *   - `payroll_employee_line_batch_fk` — composite, ON DELETE CASCADE.
 *   - trigger `payroll_employee_line_requires_draft_batch` — published payload
 *     frozen, and `period_id` must equal its batch's.
 *   - trigger `payroll_employee_line_matches_dataset` — only inside a `payroll`
 *     batch.
 *   - trigger `payroll_employee_line_freeze_organization_id`.
 */
import {
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const payroll_employee_line = pgTable(
  "payroll_employee_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    import_batch_id: uuid("import_batch_id").notNull(),
    payroll_employee_id: uuid("payroll_employee_id").notNull(),
    period_id: uuid("period_id").notNull(),
    /** Hrubá mzda. `numeric(14,2)` (§0.7), read as a STRING. */
    gross: numeric("gross", { precision: 14, scale: 2 }),
    /** Srážky celkem. */
    deductions_total: numeric("deductions_total", { precision: 14, scale: 2 }),
    /** Čistá mzda. Stored as stated, never `gross − deductions_total`. */
    net: numeric("net", { precision: 14, scale: 2 }),
    /** Náklad zaměstnavatele for this person. */
    employer_cost: numeric("employer_cost", { precision: 14, scale: 2 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("payroll_employee_line_identity_unique").on(
      table.import_batch_id,
      table.payroll_employee_id,
    ),
    index("payroll_employee_line_batch_idx").on(
      table.import_batch_id,
      table.payroll_employee_id,
    ),
    index("payroll_employee_line_employee_idx").on(
      table.organization_id,
      table.payroll_employee_id,
      table.period_id,
    ),
  ],
)
