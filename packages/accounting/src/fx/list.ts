/**
 * listFxRates — the FX-rate reference surface for the Finance ▸ Číselníky ▸ Kurzy
 * page. Presentation read over the shared `fx_rate` store (Case-B, no tenant
 * scope), safe under `withOrgReadonly`. Returns rows VERBATIM — raw ČNB kurz
 * (`rate`) + množství (`unit_amount`); the per-unit division is the resolver's
 * job (`effectiveRate`/`convertAmount`), never this read, so the page shows the
 * auditable stored values. Distinct from `resolveFxRate` in rates.ts (the
 * money-core lookup) — this is a plain list for display.
 */
import { sql } from "drizzle-orm"
import { rows } from "../sql"
import type { ReadExecutor } from "../sql"

/** One row of the FX-rate reference surface. Snake_case, DB-native. `rate` is a
 *  decimal string (numeric(18,6)); never a JS float. */
export interface FxRateListRow {
  from_code: string
  to_code: string
  rate_date: string
  rate_kind: string
  unit_amount: number
  rate: string
  source: string
}

/**
 * List stored FX rates, newest first then by pair. `onDate` narrows to a single
 * fixing date (the page's date facet); omitted returns the whole history. Reads
 * the shared store, so no org filter — but must run inside an org-bound tx.
 */
export function listFxRates(
  db: ReadExecutor,
  filter: { onDate?: string } = {},
): Promise<FxRateListRow[]> {
  const where = filter.onDate
    ? sql`WHERE rate_date = ${filter.onDate}::date`
    : sql``
  return rows<FxRateListRow>(
    db,
    sql`SELECT from_code, to_code, rate_date::text AS rate_date, rate_kind,
               unit_amount, rate::text AS rate, source
        FROM fx_rate
        ${where}
        ORDER BY rate_date DESC, from_code ASC, to_code ASC`,
  )
}
