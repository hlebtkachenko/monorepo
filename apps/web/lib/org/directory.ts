import "server-only"

import { withOrgReadonly } from "@workspace/db"
import { listCountries, listParties } from "@workspace/accounting"

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

/** One party as the Subjekty register page renders it. party_kind + the derived
 *  supplier/customer role are localized separately (next-intl) at the page. */
export interface PartyRegisterEntry {
  id: string
  name: string
  partyKindCode: string | null
  ico: string | null
  dic: string | null
  countryCode: string | null
  isSupplier: boolean
  isCustomer: boolean
  archived: boolean
}

export async function getPartyRegister(input: {
  organizationId: string
  userId: string | null
}): Promise<PartyRegisterEntry[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    listParties(db, { activeOnly: true }),
  )
  return rows.map((row) => ({
    id: row.id,
    // Directories display precedence: display_name → legal_name → dedup name.
    name: row.display_name ?? row.legal_name ?? row.name ?? "",
    partyKindCode: row.party_kind_code,
    ico: row.ico,
    dic: row.tax_id,
    countryCode: row.country_code,
    isSupplier: row.is_supplier,
    isCustomer: row.is_customer,
    archived: row.archived_at != null,
  }))
}
