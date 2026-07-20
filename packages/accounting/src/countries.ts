/**
 * Country reference register read (Adresář ▸ Veřejné číselníky ▸ Státy).
 *
 * The SINGLE domain source for the country list surface — the web RSC page and the /v1
 * controllers both read here, so the SELECT lives once, not duplicated per caller. Reference
 * read (no tenant scope), safe under `withOrgReadonly`. Snake_case DB-native rows; the app
 * edge camelCases for presentation.
 *
 * Display NAMES are not returned here — the app localizes via next-intl (`countryNames`,
 * keyed by iso2), matching the reference-name i18n mechanism.
 */
import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the country register. Snake_case, DB-native. */
export interface CountryRow {
  iso2: string
  currency_code: string | null
  active: boolean
}

/**
 * List the ISO 3166-1 country register, sorted by iso2. `activeOnly` narrows to countries
 * still offered for selection (retired entries keep their historical rows).
 */
export function listCountries(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<CountryRow[]> {
  const conds: SQL[] = []
  if (filter.activeOnly) conds.push(sql`active = true`)
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``
  return rows<CountryRow>(
    db,
    sql`SELECT iso2, currency_code, active
        FROM country
        ${where}
        ORDER BY iso2`,
  )
}
