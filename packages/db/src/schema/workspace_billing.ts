/**
 * workspace_billing — per-workspace billing details.
 *
 * Mirrors: packages/db/migrations/0005_workspace.sql (CREATE TABLE workspace_billing)
 *
 * Generalized: tax_id, vat_id, country (ISO-3166-1 alpha-2). No CZ-specific regex.
 */
import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { workspace } from "./workspace.js"

export const workspace_billing = pgTable("workspace_billing", {
  workspace_id: uuid("workspace_id")
    .notNull()
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  legal_name: text("legal_name").notNull(),
  tax_id: text("tax_id"),
  vat_id: text("vat_id"),
  address_street: text("address_street").notNull(),
  address_city: text("address_city").notNull(),
  address_zip: varchar("address_zip", { length: 20 }).notNull(),
  country: varchar("country", { length: 2 }).notNull(),
  billing_email: text("billing_email"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
