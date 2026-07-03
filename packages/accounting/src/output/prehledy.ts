/**
 * Přehledy (SINGLE_ENTRY §13b/3): přehled o příjmech a výdajích, R9-derived from
 * monetary_period_summary. Průběžné položky (is_clearing — own-account transfers)
 * are excluded from income/expense totals. The daňový základ reads total_tax_base
 * directly: postMonetary defaults it to the cash amount for a neplátce and takes
 * the caller's distinct net base for a plátce, so it is always authoritative and
 * never guessed from gross cash (which would re-introduce pass-through VAT, §9).
 * Period-scoped, SQL sums. The přehled o majetku a závazcích is deferred.
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
        SELECT direction, is_tax_relevant, total_amount, total_tax_base AS base
          FROM monetary_period_summary
         WHERE period_id = ${periodId}::uuid AND is_clearing = false
      )
      SELECT
        COALESCE(SUM(base)         FILTER (WHERE direction = 'INFLOW'  AND is_tax_relevant), 0)::numeric(19,4)     AS prijmy_danove,
        COALESCE(SUM(total_amount) FILTER (WHERE direction = 'INFLOW'  AND NOT is_tax_relevant), 0)::numeric(19,4) AS prijmy_nedanove,
        COALESCE(SUM(base)         FILTER (WHERE direction = 'OUTFLOW' AND is_tax_relevant), 0)::numeric(19,4)     AS vydaje_danove,
        COALESCE(SUM(total_amount) FILTER (WHERE direction = 'OUTFLOW' AND NOT is_tax_relevant), 0)::numeric(19,4) AS vydaje_nedanove,
        (COALESCE(SUM(base) FILTER (WHERE direction = 'INFLOW'  AND is_tax_relevant), 0)
          - COALESCE(SUM(base) FILTER (WHERE direction = 'OUTFLOW' AND is_tax_relevant), 0))::numeric(19,4)        AS rozdil_danovy
      FROM s`,
  )
  return { type: "OVERVIEWS", ...r }
}
