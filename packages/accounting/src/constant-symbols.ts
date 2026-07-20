/**
 * Konstantní-symbol reference register read (Finance ▸ Číselníky ▸ Konstantní
 * symboly).
 *
 * The SINGLE domain source for the KS list surface — the web RSC page (and any
 * future /v1 controller) read here, so the SELECT lives once. Reference read (no
 * tenant scope), safe under `withOrgReadonly`. Snake_case DB-native rows; the app
 * edge camelCases for presentation.
 *
 * Display NAMES are not returned here — the app localizes via next-intl
 * (`constantSymbolNames`, keyed by code), matching the reference-name i18n
 * mechanism.
 */
import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the konstantní-symbol register. Snake_case, DB-native. */
export interface ConstantSymbolRow {
  code: string
  active: boolean
}

/**
 * List the konstantní-symbol register, sorted by code. `activeOnly` narrows to
 * symbols still offered for selection (retired entries keep their rows).
 */
export function listConstantSymbols(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<ConstantSymbolRow[]> {
  const where = filter.activeOnly ? sql`WHERE active = true` : sql``
  return rows<ConstantSymbolRow>(
    db,
    sql`SELECT code, active
        FROM constant_symbol
        ${where}
        ORDER BY code`,
  )
}
