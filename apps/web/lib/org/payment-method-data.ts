import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listPaymentMethods } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Formy úhrady page. Opens the
 * org-bound readonly tx (the domain read in `@workspace/accounting` is the single
 * source; this layer only opens the transaction and camelCases). `payment_method`
 * is a shared vocabulary (no tenant scope), read under `withOrgReadonly` like the
 * other reference surfaces. Display names are resolved separately via next-intl
 * (`org.paymentMethods.names`), keyed by `code`.
 */

/** One payment method as the Formy úhrady register renders it. */
export interface PaymentMethodEntry {
  code: string
  isCash: boolean
  requiresBankDetail: boolean
  isActive: boolean
}

export async function getPaymentMethods(input: {
  organizationId: string
  userId: string | null
}): Promise<PaymentMethodEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listPaymentMethods(db),
  )
  return rows.map((row) => ({
    code: row.code,
    isCash: row.is_cash,
    requiresBankDetail: row.requires_bank_detail,
    isActive: row.is_active,
  }))
}
