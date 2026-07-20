/**
 * filing_record — persisted tax-filing status for an organization's periodic
 * obligations. Materializes the @workspace/accounting FilingRecord domain type:
 * a row records that an obligation for a filing period reached FILED / ACCEPTED /
 * REJECTED. NOT_TRACKED is row-absence, so it is never stored.
 *
 * Mirrors: packages/db/migrations/0080_filing_record.sql
 *
 * CALENDAR grain — the filing period is the (period_start, period_end) pair, NOT
 * a fiscal accounting_period, because VAT / payroll periods are calendar-aligned.
 * organization_id is the ONLY FK. Organization-scoped (FORCE RLS +
 * organization_isolation, applied in 0080). Composite UNIQUE(id, organization_id)
 * is the composite-FK target for future refs; UNIQUE(organization_id,
 * obligation_kind, period_start, period_end) keeps the status idempotent. The RLS
 * policy lives in the migration, not this DSL.
 */
import { date, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { obligationKind, filingStatus } from "./_enums"
import { organization } from "./organization"

export const filing_record = pgTable(
  "filing_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    obligation_kind: obligationKind("obligation_kind").notNull(),
    period_start: date("period_start").notNull(),
    period_end: date("period_end").notNull(),
    status: filingStatus("status").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    recorded_by: uuid("recorded_by").notNull(),
  },
  (t) => [
    unique("filing_record_id_org_unique").on(t.id, t.organization_id),
    unique("filing_record_org_kind_period_unique").on(
      t.organization_id,
      t.obligation_kind,
      t.period_start,
      t.period_end,
    ),
  ],
)
