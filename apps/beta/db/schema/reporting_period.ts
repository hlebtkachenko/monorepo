/**
 * reporting_period — the period identity every stamped dataset points at.
 *
 * Mirrors: apps/beta/db/migrations/0005_filings.sql (CREATE TABLE
 * reporting_period).
 *
 * Spec §4: "every import/stamp references period_id". Filings point at it today;
 * import_batch, statement_line, trial_balance_line, partner_saldo,
 * payroll_summary and payroll_employee_line all point at it from PR 23 onwards.
 *
 * `starts_on` / `ends_on` are GENERATED STORED columns, not typed ones: they are
 * a pure function of (period_kind, year, month, quarter), and a typed pair would
 * be a second source of truth that eventually disagrees with the label above it
 * — the exact failure §0.4 is written against.
 *
 * CHECK constraints (year range, the per-kind shape), the identity UNIQUE with
 * `NULLS NOT DISTINCT`, the composite `UNIQUE (id, organization_id)` that
 * filing's tenancy-carrying FK targets, and the trigger that freezes the
 * identity all live in the migration — repo convention.
 */
import {
  date,
  index,
  pgTable,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaPeriodKind } from "./_enums"
import { organization } from "./organization"

export const reporting_period = pgTable(
  "reporting_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    period_kind: betaPeriodKind("period_kind").notNull(),
    year: smallint("year").notNull(),
    /** Set iff `period_kind = 'month'`. */
    month: smallint("month"),
    /** Set iff `period_kind = 'quarter'`. */
    quarter: smallint("quarter"),
    /**
     * Derived in the database from (period_kind, year, month, quarter).
     *
     * `generatedAlwaysAs` is what keeps these two out of the INSERT type — a
     * generated column cannot be written, and Drizzle enforces that at compile
     * time. The expression it is handed is a POINTER, not the real one: it is
     * consumed only by `drizzle-kit generate`, which is forbidden repo-wide
     * (ADR-0009, and `pnpm --filter beta db:generate` hard-exits), so it is
     * never emitted, parsed or executed. The real expression lives in the
     * migration, which is the source of truth for it — copying twenty lines of
     * `make_date` arithmetic into a file that never runs it would create a
     * second version to drift instead of a mirror.
     */
    starts_on: date("starts_on")
      .notNull()
      .generatedAlwaysAs(sql`/* see 0005_filings.sql */`),
    ends_on: date("ends_on")
      .notNull()
      .generatedAlwaysAs(sql`/* see 0005_filings.sql */`),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("reporting_period_organization_ends_idx").on(
      table.organization_id,
      table.ends_on,
    ),
  ],
)
