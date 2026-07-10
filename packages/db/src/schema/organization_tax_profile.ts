/**
 * organization_tax_profile — time-versioned operational tax attributes the
 * statutory obligation engine needs but cannot derive from the books
 * Payroll relationship and monthly remittance facts. Independent
 * of účetní období, versioned by [valid_from, valid_to] like vat_status.
 *
 * Mirrors: packages/db/migrations/0048_organization_tax_profile.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation). The no-overlap
 * gist EXCLUDE constraint lives in the migration only — EXCLUDE constraints
 * are not in this DSL.
 */
import { boolean, date, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"

export const organization_tax_profile = pgTable("organization_tax_profile", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  valid_from: date("valid_from").notNull(),
  valid_to: date("valid_to"), // null = current
  has_employees: boolean("has_employees").notNull(),
  has_standard_employment: boolean("has_standard_employment"),
  has_dpp: boolean("has_dpp"),
  has_dpc: boolean("has_dpc"),
  social_insurance_participation: boolean("social_insurance_participation"),
  health_insurance_participation: boolean("health_insurance_participation"),
  payroll_tax_advance_due: boolean("payroll_tax_advance_due"),
  special_rate_withholding_due: boolean("special_rate_withholding_due"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
