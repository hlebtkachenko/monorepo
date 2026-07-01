/**
 * Přehledy (SINGLE_ENTRY §13b/3): přehled o příjmech a výdajích, R9-derived from
 * monetary_period_summary. Průběžné položky (is_clearing — own-account transfers)
 * are excluded from income/expense totals. The daňový základ uses total_tax_base
 * when recorded, else the cash amount (the §9 base excludes pass-through VAT for
 * a registered payer; for a neplátce the cash amount IS the base). Period-scoped,
 * SQL sums. The přehled o majetku a závazcích is deferred.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface Prehledy {
  type: "OVERVIEWS"
  prijmy_danove: Decimal
  prijmy_nedanove: Decimal
  vydaje_danove: Decimal
  vydaje_nedanove: Decimal
  rozdil_danovy: Decimal
}

export async function buildPrehledy(
  db: RowExecutor,
  periodId: string,
): Promise<Prehledy> {
  const r = await one<Omit<Prehledy, "type">>(
    db,
    sql`
      WITH s AS (
        SELECT direction, is_tax_relevant, total_amount,
               CASE WHEN total_tax_base <> 0 THEN total_tax_base ELSE total_amount END AS base
          FROM monetary_period_summary
         WHERE period_id = ${periodId}::uuid AND is_clearing = false
      )
      SELECT
        COALESCE(SUM(base)         FILTER (WHERE direction = 'INFLOW'  AND is_tax_relevant), 0)        AS prijmy_danove,
        COALESCE(SUM(total_amount) FILTER (WHERE direction = 'INFLOW'  AND NOT is_tax_relevant), 0)    AS prijmy_nedanove,
        COALESCE(SUM(base)         FILTER (WHERE direction = 'OUTFLOW' AND is_tax_relevant), 0)        AS vydaje_danove,
        COALESCE(SUM(total_amount) FILTER (WHERE direction = 'OUTFLOW' AND NOT is_tax_relevant), 0)    AS vydaje_nedanove,
        COALESCE(SUM(base) FILTER (WHERE direction = 'INFLOW'  AND is_tax_relevant), 0)
          - COALESCE(SUM(base) FILTER (WHERE direction = 'OUTFLOW' AND is_tax_relevant), 0)            AS rozdil_danovy
      FROM s`,
  )
  return { type: "OVERVIEWS", ...r }
}
