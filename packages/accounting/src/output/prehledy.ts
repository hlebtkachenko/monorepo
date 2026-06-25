/**
 * Přehledy (JEDNODUCHE §13b/3): přehled o příjmech a výdajích, derived from the
 * peněžní deník (R9). Průběžné položky (own-account transfers) are excluded from
 * income/expense totals. Period-scoped, SQL sums. The přehled o majetku a
 * závazcích is deferred (majetek/závazky stubs, spec §11).
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface Prehledy {
  typ: "PREHLEDY"
  prijmy_danove: Decimal
  prijmy_nedanove: Decimal
  vydaje_danove: Decimal
  vydaje_nedanove: Decimal
  rozdil_danovy: Decimal
}

export async function buildPrehledy(
  db: RowExecutor,
  obdobiId: string,
): Promise<Prehledy> {
  const r = await one<Omit<Prehledy, "typ">>(
    db,
    sql`
      -- Daňové totals use zaklad_dane (tax base, excludes pass-through VAT, §9),
      -- falling back to castka when no base is recorded; nedaňové use castka.
      SELECT
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'prijem' AND pdr.danovy), 0) AS prijmy_danove,
        COALESCE(SUM(pdr.castka) FILTER (WHERE pdr.smer = 'prijem' AND NOT pdr.danovy), 0) AS prijmy_nedanove,
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'vydaj' AND pdr.danovy), 0)  AS vydaje_danove,
        COALESCE(SUM(pdr.castka) FILTER (WHERE pdr.smer = 'vydaj' AND NOT pdr.danovy), 0)  AS vydaje_nedanove,
        COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'prijem' AND pdr.danovy), 0)
          - COALESCE(SUM(COALESCE(pdr.zaklad_dane, pdr.castka)) FILTER (WHERE pdr.smer = 'vydaj' AND pdr.danovy), 0) AS rozdil_danovy
      FROM penezni_denik_radek pdr
      JOIN ucetni_zapis z ON pdr.zapis_id = z.id
      WHERE z.obdobi_id = ${obdobiId}::uuid
        AND z.regime = 'JEDNODUCHE'
        AND pdr.prubezny = false
    `,
  )
  return { typ: "PREHLEDY", ...r }
}
