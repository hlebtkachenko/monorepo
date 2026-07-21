/**
 * listPaymentForms — the forma-úhrady reference read (Finance ▸ Číselníky ▸ Formy
 * úhrady). Reads the shared `payment_form` číselník (Case-B, no tenant scope), safe
 * under `withOrgReadonly`. Snake_case DB-native rows; the app edge camelCases for
 * presentation. Display NAMES + the invoice PHRASE are not returned here — the app
 * localizes via next-intl (`paymentFormNames` / `paymentFormPhrases`, keyed by code),
 * matching the reference-name i18n mechanism.
 *
 * Distinct from `listPaymentMethods`' former surface: `payment_method` is the internal
 * Brain-intake IR vocabulary (cash | transfer | card | other); `payment_form` is the
 * richer human list the user picks from.
 */
import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the forma-úhrady register. Snake_case, DB-native. */
export interface PaymentFormRow {
  code: string
  offer_on_invoice: boolean
  offer_on_cash_desk: boolean
  offer_on_pos: boolean
  is_active: boolean
}

/** List the forma-úhrady register, sorted by code. `activeOnly` narrows to forms
 *  still offered for selection. */
export function listPaymentForms(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<PaymentFormRow[]> {
  const where = filter.activeOnly ? sql`WHERE is_active = true` : sql``
  return rows<PaymentFormRow>(
    db,
    sql`SELECT code, offer_on_invoice, offer_on_cash_desk, offer_on_pos, is_active
        FROM payment_form
        ${where}
        ORDER BY code`,
  )
}
