/**
 * payment_form — forma úhrady reference číselník (Finance ▸ Číselníky ▸ Formy
 * úhrady). The user-facing Czech payment-manner list with per-surface offer flags.
 *
 * Mirrors: packages/db/migrations/0084_payment_form.sql
 *
 * Distinct from `payment_method` (the internal Brain-intake IR vocabulary that
 * drives posting). Reference (system) table — shared, NOT tenant-scoped, no RLS
 * (Case-B). Rows seeded in 0085. Display names + the invoice phrase are NOT stored
 * here — they localize via next-intl (`paymentFormNames` / `paymentFormPhrases`,
 * keyed by code).
 */
import { boolean, pgTable, text } from "drizzle-orm/pg-core"

export const payment_form = pgTable("payment_form", {
  code: text("code").primaryKey(),
  offer_on_invoice: boolean("offer_on_invoice").notNull().default(false),
  offer_on_cash_desk: boolean("offer_on_cash_desk").notNull().default(false),
  offer_on_pos: boolean("offer_on_pos").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
})
