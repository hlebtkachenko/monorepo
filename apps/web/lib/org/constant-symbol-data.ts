import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listConstantSymbols } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Konstantní symboly page. Opens the
 * org-bound readonly tx (the domain read in `@workspace/accounting` is the single
 * source; this layer only opens the transaction and camelCases). `constant_symbol`
 * is a shared reference table (no tenant scope), read under `withOrgReadonly` like
 * the other reference surfaces. Display names resolve separately via next-intl
 * (`constantSymbolNames`), keyed by `code`.
 */

/** One konstantní symbol as the register renders it. */
export interface ConstantSymbolEntry {
  code: string
  active: boolean
}

export async function getConstantSymbols(input: {
  organizationId: string
  userId: string | null
}): Promise<ConstantSymbolEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listConstantSymbols(db),
  )
  return rows.map((row) => ({
    code: row.code,
    active: row.active,
  }))
}
