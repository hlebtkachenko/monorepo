/**
 * payment_method — forma úhrady reference vocabulary (cash | transfer | card |
 * other), the intake IR PaymentMethod set. A fixed platform vocabulary, so it is
 * a Case-B shared reference table (no tenant scope, no RLS) like `currency`.
 *
 * Mirrors: packages/db/migrations/0079_payment_method.sql
 *
 * Display names are localized via next-intl (org.paymentMethods.names.<code>),
 * NOT stored per-language. Seed rows + GRANT live in the migration, not this DSL.
 */
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const payment_method = pgTable("payment_method", {
  code: text("code").primaryKey(), // cash | transfer | card | other
  sort_order: integer("sort_order").notNull().default(0),
  is_cash: boolean("is_cash").notNull().default(false),
  requires_bank_detail: boolean("requires_bank_detail")
    .notNull()
    .default(false),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
