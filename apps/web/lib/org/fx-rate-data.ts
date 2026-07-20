import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listFxRates } from "@workspace/accounting"

/**
 * App-edge read for the Finance ▸ Číselníky ▸ Kurzy page. Opens the org-bound
 * readonly tx (the domain read in `@workspace/accounting` is the single source;
 * this layer only opens the transaction and camelCases for presentation).
 *
 * `fx_rate` is the shared ČNB store (no tenant scope), but the read still runs
 * under `withOrgReadonly` — an authenticated, org-bound readonly handle — like
 * the other reference surfaces.
 */

/** One FX rate as the Kurzy register renders it. `rate` stays a decimal string
 *  (numeric(18,6)); never a JS float. */
export interface FxRateRegisterEntry {
  fromCode: string
  toCode: string
  rateDate: string
  rateKind: string
  unitAmount: number
  rate: string
  source: string
}

export async function getFxRateRegister(input: {
  organizationId: string
  userId: string | null
}): Promise<FxRateRegisterEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listFxRates(db),
  )
  return rows.map((row) => ({
    fromCode: row.from_code,
    toCode: row.to_code,
    rateDate: row.rate_date,
    rateKind: row.rate_kind,
    unitAmount: row.unit_amount,
    rate: row.rate,
    source: row.source,
  }))
}
