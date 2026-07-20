import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listFinancialInstitutions } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Peněžní ústavy page. Opens the
 * org-bound readonly tx (the domain read in `@workspace/accounting` is the single
 * source; this layer only opens the transaction and camelCases). `financial_institution`
 * is a shared reference table (no tenant scope), read under `withOrgReadonly` like
 * the other reference surfaces. Display names resolve separately via next-intl
 * (`bankNames`), keyed by `bankCode`.
 */

/** One bank as the Peněžní ústavy register renders it. */
export interface FinancialInstitutionEntry {
  bankCode: string
  active: boolean
}

export async function getFinancialInstitutions(input: {
  organizationId: string
  userId: string | null
}): Promise<FinancialInstitutionEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listFinancialInstitutions(db),
  )
  return rows.map((row) => ({
    bankCode: row.bank_code,
    active: row.active,
  }))
}
