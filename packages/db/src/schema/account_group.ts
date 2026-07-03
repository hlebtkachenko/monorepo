/**
 * account_group — BINDING level, Decree 500/2002 Příloha 4.
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE account_group)
 *
 * Reference (law) table — shared, NOT tenant-scoped. ~80 immutable group rows
 * seeded in 0025. The směrná účtová osnova binds at the 2-digit skupina, so the
 * GROUP is the legally-guaranteed rozvaha/VZZ anchor (statement-line fallback,
 * decision 3). Sign-split columns handle mixed groups (34, 48).
 * Triggers / RLS / CHECK constraints + app_assert_account_groups_mapped() live in
 * the migration, not this DSL.
 */
import { boolean, char, pgTable, smallint, text } from "drizzle-orm/pg-core"
import { accountNature } from "./_enums"

export const account_group = pgTable("account_group", {
  code: char("code", { length: 2 }).primaryKey(), // '01','31','70','71'
  class: smallint("class").notNull(), // left digit
  name_cs: text("name_cs").notNull(),
  name_en: text("name_en"),
  nature: accountNature("nature"), // hint; NULL where group mixes (cl. 3,4,7)
  is_internal: boolean("is_internal").notNull().default(false), // classes 8–9, entity-free
  is_valuation_adjustment: boolean("is_valuation_adjustment")
    .notNull()
    .default(false), // oprávky/opravné položky -> rozvaha KOREKCE col (§4/4)
  balance_sheet_line: text("balance_sheet_line"), // Příloha 1 default line for the whole skupina
  balance_sheet_line_when_debit: text("balance_sheet_line_when_debit"), // sign-split: group 34/48 DEBIT -> asset row
  balance_sheet_line_when_credit: text("balance_sheet_line_when_credit"), // sign-split: group 34/48 CREDIT -> liability row
  income_statement_line: text("income_statement_line"), // Příloha 2 default line for 5x/6x groups
})
