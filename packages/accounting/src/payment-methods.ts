/**
 * listPaymentMethods — the forma-úhrady reference read (Finance ▸ Číselníky ▸
 * Formy úhrady). Reads the shared `payment_method` vocabulary (Case-B, no tenant
 * scope), safe under `withOrgReadonly`. Snake_case DB-native rows; the app edge
 * camelCases for presentation. Display NAMES are not returned here — the app
 * localizes via next-intl (`org.paymentMethods.names`, keyed by code), matching
 * the reference-name i18n mechanism.
 */
import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the payment-method vocabulary. Snake_case, DB-native. */
export interface PaymentMethodRow {
  code: string
  sort_order: number
  is_cash: boolean
  requires_bank_detail: boolean
  is_active: boolean
}

/** List the forma-úhrady vocabulary, in display order. `activeOnly` narrows to
 *  methods still offered for selection. */
export function listPaymentMethods(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<PaymentMethodRow[]> {
  const where = filter.activeOnly ? sql`WHERE is_active = true` : sql``
  return rows<PaymentMethodRow>(
    db,
    sql`SELECT code, sort_order, is_cash, requires_bank_detail, is_active
        FROM payment_method
        ${where}
        ORDER BY sort_order, code`,
  )
}
