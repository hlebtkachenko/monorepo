/**
 * organization_tax_representative — zástupce (daňový poradce / zákonný zástupce),
 * DŘ §25-§30. The accountant files on the client's behalf; carries the
 * representative's own type + identifiers (IČO/DIČ + KDP ev. číslo).
 *
 * Mirrors: packages/db/migrations/0042_org_config.sql
 *
 * ORGANIZATION-scoped (FORCE RLS via organization_isolation). Partial-unique
 * one-primary index + RLS/GRANT live in the migration, not this DSL.
 */
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"

export const organization_tax_representative = pgTable(
  "organization_tax_representative",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    representative_type: text("representative_type"),
    legal_name: text("legal_name"),
    given_name: text("given_name"),
    family_name: text("family_name"),
    ico: varchar("ico", { length: 8 }),
    dic: varchar("dic", { length: 14 }),
    advisor_registration_number: text("advisor_registration_number"),
    is_primary: boolean("is_primary").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)
