/**
 * chart_template_account — the účty of a prebuilt Účtový rozvrh template.
 *
 * Mirrors: packages/db/migrations/0066_accounting_chart_directive_year.sql
 *
 * Reference (config) table — shared, NOT tenant-scoped, no RLS. number is the synthetic code
 * ('311'); analytics ('311.001') are allowed for future house variants via parent_number.
 * specializes_directive_code back-links to the stable catalogue for statement mapping (NULL
 * -> account_group fallback once seeded into a tenant chart). Triggers / RLS live in the
 * migration, not this DSL.
 */
import {
  boolean,
  char,
  foreignKey,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accountNature, debitCredit } from "./_enums"
import { chart_template } from "./chart_template"
import { directive_account } from "./directive_account"

export const chart_template_account = pgTable(
  "chart_template_account",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    template_id: uuid("template_id")
      .notNull()
      .references(() => chart_template.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // '311' | '311.001'
    name: text("name").notNull(),
    nature: accountNature("nature").notNull(),
    normal_balance: debitCredit("normal_balance"), // NULL for sign-split / closing
    tracks_open_items: boolean("tracks_open_items").notNull().default(false),
    tax_relevant: boolean("tax_relevant"), // Daňový; NULL for balance/closing
    is_allowance: boolean("is_allowance").notNull().default(false), // Oprávkový (07x/08x/09x)
    parent_number: text("parent_number"), // analytic -> synthetic parent; NULL for synthetic
    specializes_directive_code: char("specializes_directive_code", {
      length: 3,
    }),
  },
  (t) => [
    unique("chart_template_account_number_unique").on(t.template_id, t.number),
    foreignKey({
      name: "chart_template_account_directive_fk",
      columns: [t.specializes_directive_code],
      foreignColumns: [directive_account.code],
    }),
  ],
)
