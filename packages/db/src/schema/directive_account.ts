/**
 * directive_account — recommendation catalogue, seeded from coa.json.
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE directive_account)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * rozvaha builder cascade (decision 3): account.specializes_directive_code -> THIS
 * row's mapping (exact synthetic sub-row); else account_group fallback; else (8–9 /
 * OFF_BALANCE / CLOSING) no statement line. Sign-split pair picks the row by
 * sign(closing_balance).
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import { boolean, char, pgTable, text } from "drizzle-orm/pg-core"
import { accountNature, debitCredit } from "./_enums"
import { account_group } from "./account_group"

export const directive_account = pgTable("directive_account", {
  code: char("code", { length: 3 }).primaryKey(), // '311','518','701'
  group_code: char("group_code", { length: 2 })
    .notNull()
    .references(() => account_group.code),
  name_cs: text("name_cs").notNull(),
  name_en: text("name_en"),
  nature: accountNature("nature").notNull(),
  normal_balance: debitCredit("normal_balance"), // NULL where genuinely mixed/technical
  balance_sheet_line: text("balance_sheet_line"), // Příloha 1, e.g. 'B.II.4'
  balance_sheet_line_when_debit: text("balance_sheet_line_when_debit"), // sign-split: 481/341-345 DEBIT -> asset row
  balance_sheet_line_when_credit: text("balance_sheet_line_when_credit"), // sign-split: 481/341-345 CREDIT -> liability row
  income_statement_line: text("income_statement_line"), // Příloha 2
  deprecated: boolean("deprecated").notNull().default(false),
})
