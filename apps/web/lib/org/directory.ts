import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listCountries } from "@workspace/accounting"

/**
 * App-edge reads for the Directories (Adresář) module. Opens the org-bound
 * readonly tx (the domain reads in `@workspace/accounting` are the single source;
 * this layer only opens the transaction and camelCases for presentation).
 *
 * `country` is a global reference register (no tenant scope), but the read still
 * runs under `withOrgReadonly` — an authenticated, org-bound readonly handle — so
 * a page hands it the org + user resolved from the membership, exactly like the
 * other list surfaces.
 */

/** One country as the Státy register page renders it. Display names are resolved
 *  separately via next-intl (`countryNames`), keyed by `iso2`. */
export interface CountryRegisterEntry {
  iso2: string
  currencyCode: string | null
}

export async function getCountryRegister(input: {
  organizationId: string
  userId: string | null
}): Promise<CountryRegisterEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listCountries(db),
  )
  return rows.map((row) => ({
    iso2: row.iso2,
    currencyCode: row.currency_code,
  }))
}
