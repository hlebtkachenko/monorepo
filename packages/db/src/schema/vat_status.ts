/**
 * vat_status — time-versioned VAT status link, independent of účetní období.
 *
 * Mirrors: packages/db/migrations/0026_accounting_organization_reshape.sql (CREATE TABLE vat_status)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * The no-overlap guard (M8) is a gist EXCLUDE constraint that lives in the
 * migration only — triggers / RLS / CHECK / EXCLUDE constraints are not in this DSL.
 */
import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { vatFilingPeriod } from "./_enums"
import { organization } from "./organization"
import { vat_regime } from "./vat_regime"

export const vat_status = pgTable("vat_status", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  vat_regime_code: text("vat_regime_code")
    .notNull()
    .references(() => vat_regime.code),
  valid_from: date("valid_from").notNull(),
  valid_to: date("valid_to"), // null = current
  filing_period: vatFilingPeriod("filing_period"), // for PAYER
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
