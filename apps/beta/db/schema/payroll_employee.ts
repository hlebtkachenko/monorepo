/**
 * payroll_employee — the employee register of one book (spec §2.6 Zaměstnanci,
 * §2.6.1 employee seat, §4 data model).
 *
 * Mirrors: apps/beta/db/migrations/0016_payroll.sql (CREATE TABLE
 * payroll_employee).
 *
 * A REGISTRY, NOT A PERIOD PAYLOAD. A person is on the books across months; the
 * monthly figures live in `payroll_employee_line`. The same shape as `asset` —
 * office- or agent-written, matched on `external_ref`, never batch-owned.
 *
 * PERSONAL-DATA MINIMALISM IS THE COLUMN LIST. A name, an employment type, two
 * employment dates, an optional portal-account link. No rodné číslo, no birth
 * date, no address, no bank account, no health-insurance number — none of which
 * any surface in spec §2.6 renders, and each of which would turn this table into
 * a personnel file this product has no lawful reason to hold. The office's
 * payroll software is the controller of that data; beta receives the figures.
 *
 * `active` AND `ended_on` ARE INDEPENDENT. `ended_on` is the employment fact;
 * `active` is the office's own listing decision. Spec §2.6.1 makes the leaver's
 * deactivation a one-click act and explicitly "never automatic" — the Pro účetní
 * warning "Zaměstnanec ukončen, účet aktivní" exists because the two can
 * legitimately disagree, so neither is derived from the other here.
 *
 * DB-enforced invariants, all in the migration:
 *   - `payroll_employee_app_user_idx` — spec §4's partial unique
 *     (organization, app_user_id): one employee seat per account per book.
 *   - `payroll_employee_external_ref_idx` — the agent upsert match key, partial
 *     so a hand-typed row is never touched by an ingestion run.
 *   - `payroll_employee_employment_dates_ordered` — an employment cannot end
 *     before it began.
 *   - `payroll_employee_id_organization_unique` — the target of the composite,
 *     tenancy-carrying FKs from `payroll_employee_line` and `document`.
 *   - trigger `payroll_employee_freeze_organization_id` — never changes books.
 *   - trigger `payroll_employee_touch_updated_at`.
 */
import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { app_user } from "./app_user"
import { betaPayrollContractType } from "./_enums"
import { organization } from "./organization"

export const payroll_employee = pgTable(
  "payroll_employee",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Jméno a příjmení as the office's payroll software holds it. */
    full_name: text("full_name").notNull(),
    contract_type: betaPayrollContractType("contract_type").notNull(),
    /** Datum nástupu. Nullable — the office may register before stating it. */
    started_on: date("started_on"),
    /** Datum ukončení. Independent of `active` — see the file header. */
    ended_on: date("ended_on"),
    active: boolean("active").notNull().default(true),
    /**
     * The employee seat's link (spec §2.6.1): a `guest` membership whose account
     * is this row's sees ONLY its own payroll.
     *
     * The LINK'S LIFECYCLE is the employee-seat PR's, not this schema's, and the
     * agent ingestion API deliberately cannot write it — binding a portal
     * account to a person is not an accounting fact an office agent states.
     */
    app_user_id: uuid("app_user_id").references(() => app_user.id, {
      onDelete: "set null",
    }),
    /** Agent upsert match key — see `filing.external_ref` (migration 0011). */
    external_ref: text("external_ref"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payroll_employee_organization_idx").on(
      table.organization_id,
      table.active,
      table.full_name,
    ),
  ],
)
