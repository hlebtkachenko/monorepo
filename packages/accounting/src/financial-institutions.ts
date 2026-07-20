/**
 * Financial-institution reference register read (Finance ▸ Číselníky ▸ Peněžní
 * ústavy).
 *
 * The SINGLE domain source for the bank-code list surface — the web RSC page (and
 * any future /v1 controller) read here, so the SELECT lives once. Reference read
 * (no tenant scope), safe under `withOrgReadonly`. Snake_case DB-native rows; the
 * app edge camelCases for presentation.
 *
 * Display NAMES are not returned here — the app localizes via next-intl
 * (`bankNames`, keyed by bank_code), matching the reference-name i18n mechanism.
 */
import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the bank-code register. Snake_case, DB-native. */
export interface FinancialInstitutionRow {
  bank_code: string
  active: boolean
}

/**
 * List the ČNB bank-code register, sorted by bank_code. `activeOnly` narrows to
 * institutions still offered for selection (retired entries keep their rows).
 */
export function listFinancialInstitutions(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<FinancialInstitutionRow[]> {
  const where = filter.activeOnly ? sql`WHERE active = true` : sql``
  return rows<FinancialInstitutionRow>(
    db,
    sql`SELECT bank_code, active
        FROM financial_institution
        ${where}
        ORDER BY bank_code`,
  )
}
