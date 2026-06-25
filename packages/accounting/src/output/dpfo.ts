/**
 * Podklad pro DPFO (DANOVA_EVIDENCE §7b ZDP): taxable income and expense sums
 * from the peněžní deník, and the resulting základ daně (tax base). Průběžné
 * položky and nedaňové rows are excluded from the base (R9). Period-scoped, SQL
 * sums. Daňová evidence is outside the Accounting Act — these rows are a
 * technical record, not účetní záznamy.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface Dpfo {
  typ: "DPFO"
  prijmy_danove: Decimal
  vydaje_danove: Decimal
  zaklad_dane: Decimal
}

export async function buildDpfo(
  db: RowExecutor,
  obdobiId: string,
): Promise<Dpfo> {
  const r = await one<Omit<Dpfo, "typ">>(
    db,
    sql`
      -- Tax base uses zaklad_dane (excludes pass-through VAT for a registered
      -- OSVČ, §9); falls back to castka when no separate base is recorded.
      SELECT
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'prijem' AND pdr.danovy), 0) AS prijmy_danove,
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'vydaj'  AND pdr.danovy), 0) AS vydaje_danove,
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'prijem' AND pdr.danovy), 0)
          - COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'vydaj' AND pdr.danovy), 0) AS zaklad_dane
      FROM penezni_denik_radek pdr
      JOIN ucetni_zapis z ON pdr.zapis_id = z.id
      WHERE z.obdobi_id = ${obdobiId}::uuid
        AND z.regime = 'DANOVA_EVIDENCE'
        AND pdr.prubezny = false
    `,
  )
  return { typ: "DPFO", ...r }
}
