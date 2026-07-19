/**
 * chart_template — a prebuilt Účtový rozvrh (our house default) per year + variant.
 *
 * Mirrors: packages/db/migrations/0067_accounting_chart_directive_year.sql
 *
 * Reference (config) table — shared, NOT tenant-scoped, no RLS. Built on top of the osnova +
 * our system accounts; a user forks it to start their entity chart. Separate store from
 * directive_account_year (osnova): a template may carry extra flags + (future variants)
 * analytic účty an osnova must never hold. The účty live in chart_template_account.
 * Triggers / RLS live in the migration, not this DSL.
 */
import {
  boolean,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const chart_template = pgTable(
  "chart_template",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    year: smallint("year").notNull(),
    code: text("code").notNull(), // 'MONEY_2026' | 'AFFRAME_STANDARD'
    name: text("name").notNull(),
    source: text("source"), // provenance note
    is_default: boolean("is_default").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("chart_template_year_code_unique").on(t.year, t.code)],
)
