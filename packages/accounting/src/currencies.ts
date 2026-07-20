/**
 * listCurrencies — the currency reference surface for the Finance ▸ Číselníky ▸
 * Měny page. The SINGLE domain source, read once here (web RSC + any future /v1
 * controller share it). Reads the shared `currency` catalog (no tenant scope) and
 * folds in two org-scoped facts under the same org-bound readonly tx:
 *
 *   - `enabled`    — the org has an `org_currency` row for this code (enablement).
 *   - `functional` — this code is a měna účetnictví on one of the org's
 *                    accounting periods (accounting_period.accounting_currency).
 *
 * Both org tables are FORCE-RLS, so the LEFT JOIN / subquery return only this
 * org's rows; `enabled` and `functional` are independent (a functional currency
 * is always available regardless of an org_currency row). Snake_case DB-native
 * rows; the app edge camelCases for presentation. Display names come from the DB
 * `currency.name` (the catalog is a fixed 5-row set; no next-intl map needed).
 */
import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"

/** One row of the currency reference surface. Snake_case, DB-native. */
export interface CurrencyRow {
  code: string
  name: string
  minor_units: number
  enabled: boolean
  functional: boolean
}

/**
 * List the ISO 4217 currency catalog, sorted by code, each flagged with whether
 * the current org has enabled it and whether it is one of the org's functional
 * (accounting) currencies. Must run inside an org-bound tx (withOrgReadonly /
 * withOrganization) so the org-scoped joins resolve to the caller's tenant.
 */
export function listCurrencies(db: ReadExecutor): Promise<CurrencyRow[]> {
  return rows<CurrencyRow>(
    db,
    sql`SELECT c.code,
               c.name,
               c.minor_units,
               (oc.currency_code IS NOT NULL) AS enabled,
               (c.code IN (SELECT DISTINCT accounting_currency FROM accounting_period)) AS functional
        FROM currency c
        LEFT JOIN org_currency oc ON oc.currency_code = c.code
        ORDER BY c.code`,
  )
}
