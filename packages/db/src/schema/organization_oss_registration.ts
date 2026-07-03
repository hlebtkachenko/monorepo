/**
 * organization_oss_registration — EU One-Stop-Shop registration (§110k+ ZDPH).
 * Time-versioned; no two ranges per scheme may overlap (gist EXCLUDE, like
 * vat_status). MOSS is excluded (abolished 2021-07-01). Only a plátce /
 * identifikovaná osoba may register — enforced by the orchestrator, not a DB CHECK.
 *
 * Mirrors: packages/db/migrations/0042_org_config.sql
 *
 * ORGANIZATION-scoped (FORCE RLS via organization_isolation). CHECK + EXCLUDE +
 * RLS/GRANT live in the migration, not this DSL.
 */
import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"

export const organization_oss_registration = pgTable(
  "organization_oss_registration",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    scheme: text("scheme").notNull(), // UNION | IMPORT
    valid_from: date("valid_from").notNull(),
    valid_to: date("valid_to"), // null = current
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)
