/**
 * directive_account_year — per-YEAR overlay on the stable directive_account catalogue.
 *
 * Mirrors: packages/db/migrations/0067_accounting_chart_directive_year.sql
 *
 * Reference (config) table — shared, NOT tenant-scoped, no RLS. THIS is the year-based
 * Účetní osnova (account directive): the framework a user browses + seeds a chart from.
 * Synthetic-only — it references directive_account.code and NEVER holds analytic účty.
 * name_cs is a year-specific override (NULL = inherit the catalogue name); nature +
 * normal_balance + statement mapping stay on directive_account. Triggers / RLS live in the
 * migration, not this DSL.
 */
import {
  boolean,
  char,
  pgTable,
  primaryKey,
  smallint,
  text,
} from "drizzle-orm/pg-core"
import { directive_account } from "./directive_account"

export const directive_account_year = pgTable(
  "directive_account_year",
  {
    year: smallint("year").notNull(),
    code: char("code", { length: 3 })
      .notNull()
      .references(() => directive_account.code),
    name_cs: text("name_cs"), // year-specific override; NULL -> inherit directive_account.name_cs
    tracks_open_items: boolean("tracks_open_items").notNull().default(false), // saldokonto default (§16)
    tax_relevant: boolean("tax_relevant"), // Daňový; NULL for balance/closing účty
    deprecated: boolean("deprecated").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.year, t.code] })],
)
