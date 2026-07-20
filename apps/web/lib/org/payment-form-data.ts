import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listPaymentForms } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Formy úhrady page. Opens the
 * org-bound readonly tx (the domain read in `@workspace/accounting` is the single
 * source; this layer only opens the transaction and camelCases). `payment_form` is
 * a shared reference table (no tenant scope), read under `withOrgReadonly` like the
 * other reference surfaces. Display names + the invoice phrase resolve separately
 * via next-intl (`paymentFormNames` / `paymentFormPhrases`), keyed by `code`.
 */

/** One payment form as the Formy úhrady register renders it. */
export interface PaymentFormEntry {
  code: string
  offerOnInvoice: boolean
  offerOnCashDesk: boolean
  offerOnPos: boolean
  isActive: boolean
}

export async function getPaymentForms(input: {
  organizationId: string
  userId: string | null
}): Promise<PaymentFormEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listPaymentForms(db),
  )
  return rows.map((row) => ({
    code: row.code,
    offerOnInvoice: row.offer_on_invoice,
    offerOnCashDesk: row.offer_on_cash_desk,
    offerOnPos: row.offer_on_pos,
    isActive: row.is_active,
  }))
}
