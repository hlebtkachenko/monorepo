/**
 * organization — one client book (účetní jednotka) of the accounting office.
 *
 * Mirrors: apps/beta/db/migrations/0000_init.sql (CREATE TABLE organization).
 *
 * This is the identity card of spec §2.1.5 / §2.10, decomposed per the Advisor's
 * Part-4 schema corrections:
 *   - sídlo is split into parts, not one free-text line — the Nastavení form and
 *     the ARES "navrhuje / přijmout" reconciliation both need per-field values.
 *   - the bank account is stored as prefix / number / bank code (+ IBAN / BIC),
 *     because a Czech account number is three fields and a display string cannot
 *     be validated.
 *   - `vat_regime` is an enum with a companion `vat_registered_from` date. A
 *     boolean would read as visibly wrong on an identity card.
 *
 * CHECK constraints (slug shape, IČO = 8 digits, data box = 7 lowercase
 * alphanumerics) live in the migration, not in this DSL — repo convention, see
 * packages/db/src/schema/organization.ts. `dic` is deliberately unconstrained:
 * a foreign DIČ is legitimately not CZ-shaped.
 */
import {
  boolean,
  char,
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { betaVatRegime } from "./_enums"

export const organization = pgTable("organization", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  /** URL segment: /[orgSlug]/... */
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  legal_name: text("legal_name").notNull(),
  /** IČO — 8 digits, left-padded. Stable business key for ARES re-lookup. */
  ico: varchar("ico", { length: 8 }),
  dic: varchar("dic", { length: 14 }),
  vat_regime: betaVatRegime("vat_regime").notNull().default("neplatce"),
  vat_registered_from: date("vat_registered_from"),
  registered_street: text("registered_street"),
  registered_house_number: varchar("registered_house_number", { length: 16 }),
  registered_orientation_number: varchar("registered_orientation_number", {
    length: 16,
  }),
  registered_city: text("registered_city"),
  registered_postal_code: varchar("registered_postal_code", { length: 10 }),
  registered_country_code: char("registered_country_code", { length: 2 })
    .notNull()
    .default("CZ"),
  /** Datová schránka. */
  data_box_id: varchar("data_box_id", { length: 7 }),
  /** Spisová značka (§435 NOZ). */
  court_file_number: text("court_file_number"),
  /** ÚFO code; resolved to a finanční úřad name through the copied číselník. */
  tax_office_code: varchar("tax_office_code", { length: 4 }),
  bank_account_prefix: varchar("bank_account_prefix", { length: 6 }),
  bank_account_number: varchar("bank_account_number", { length: 10 }),
  bank_code: varchar("bank_code", { length: 4 }),
  iban: varchar("iban", { length: 34 }),
  bic: varchar("bic", { length: 11 }),
  contact_email: text("contact_email"),
  contact_phone: varchar("contact_phone", { length: 32 }),
  /**
   * Demo safety (Advisor blocker B4-7): demos run from a dedicated account whose
   * memberships are all is_demo organizations, so a shared screen cannot show a
   * real client's book.
   */
  is_demo: boolean("is_demo").notNull().default(false),
  /** 24h ARES cache stamp (spec §2.10). */
  ares_fetched_at: timestamp("ares_fetched_at", { withTimezone: true }),
  archived_at: timestamp("archived_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
