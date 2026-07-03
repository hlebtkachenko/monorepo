/**
 * organization_authorized_person — statutory signer(s) of the účetní jednotka
 * (jméno / příjmení / postavení on přiznání + podpisový záznam §33a).
 *
 * Mirrors: packages/db/migrations/0042_org_config.sql
 *
 * ORGANIZATION-scoped (FORCE RLS via organization_isolation, registered in
 * ORGANIZATION_SCOPED_TABLES). Partial-unique one-primary index + RLS/GRANT live
 * in the migration, not this DSL.
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"

export const organization_authorized_person = pgTable(
  "organization_authorized_person",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    given_name: text("given_name").notNull(),
    family_name: text("family_name").notNull(),
    position: text("position"),
    is_primary: boolean("is_primary").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)
