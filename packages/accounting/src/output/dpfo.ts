/**
 * Podklad pro DPFO (TAX_RECORDS / daňová evidence §7b ZDP): taxable income and
 * expense sums from the peněžní deník (R9-derived from monetary_period_summary)
 * and the resulting základ daně. Průběžné položky and nedaňové rows are excluded
 * from the base. Daňová evidence is outside the Accounting Act — these rows are a
 * technical record, not účetní záznamy. Period-scoped, SQL sums.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface Dpfo {
  type: "PERSONAL_INCOME_TAX"
  prijmy_danove: Decimal
  vydaje_danove: Decimal
  zaklad_dane: Decimal
}

export async function buildDpfo(
  db: RowExecutor,
  periodId: string,
): Promise<Dpfo> {
  const r = await one<Omit<Dpfo, "type">>(
    db,
    sql`
      WITH s AS (
        SELECT direction,
               CASE WHEN total_tax_base <> 0 THEN total_tax_base ELSE total_amount END AS base
          FROM monetary_period_summary
         WHERE period_id = ${periodId}::uuid AND is_clearing = false AND is_tax_relevant = true
      )
      SELECT
        COALESCE(SUM(base) FILTER (WHERE direction = 'INFLOW'), 0)  AS prijmy_danove,
        COALESCE(SUM(base) FILTER (WHERE direction = 'OUTFLOW'), 0) AS vydaje_danove,
        COALESCE(SUM(base) FILTER (WHERE direction = 'INFLOW'), 0)
          - COALESCE(SUM(base) FILTER (WHERE direction = 'OUTFLOW'), 0) AS zaklad_dane
      FROM s`,
  )
  return { type: "PERSONAL_INCOME_TAX", ...r }
}
