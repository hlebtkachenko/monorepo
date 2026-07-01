/**
 * organization_business_activity — org's předmět podnikání (M:N to CZ-NACE).
 *
 * Mirrors: packages/db/migrations/0026_accounting_organization_reshape.sql (CREATE TABLE organization_business_activity)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core"
import { business_activity } from "./business_activity"
import { organization } from "./organization"

export const organization_business_activity = pgTable(
  "organization_business_activity",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    business_activity_code: text("business_activity_code")
      .notNull()
      .references(() => business_activity.code),
  },
  (t) => [
    primaryKey({ columns: [t.organization_id, t.business_activity_code] }),
  ],
)
