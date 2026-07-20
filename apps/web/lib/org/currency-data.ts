import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listCurrencies } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Měny page. Opens the org-bound
 * readonly tx (the domain read in `@workspace/accounting` is the single source;
 * this layer only opens the transaction and camelCases for presentation).
 *
 * `currency` is a shared catalog (no tenant scope), but the read still runs under
 * `withOrgReadonly` so the `enabled` / `functional` org-scoped facts folded in by
 * `listCurrencies` resolve to the caller's tenant.
 */

/** One currency as the Měny register renders it. */
export interface CurrencyRegisterEntry {
  code: string
  name: string
  minorUnits: number
  /** The org has an `org_currency` enablement row for this code. */
  enabled: boolean
  /** This code is a měna účetnictví on one of the org's accounting periods. */
  functional: boolean
}

export async function getCurrencyRegister(input: {
  organizationId: string
  userId: string | null
}): Promise<CurrencyRegisterEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listCurrencies(db),
  )
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    minorUnits: row.minor_units,
    enabled: row.enabled,
    functional: row.functional,
  }))
}
