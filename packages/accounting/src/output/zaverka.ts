/**
 * Účetní závěrka (PODVOJNE §18). Derived from period-scoped general-ledger
 * closing balances (R9): rozvaha (aktiva / pasiva) + výsledovka (náklady /
 * výnosy / výsledek). Technical close accounts (účtová třída 7) are excluded.
 * All sums are computed in SQL (decimal, no JS float). Formatting/statutory
 * layout is deferred (spec §11) — numbers only.
 */

import { sql } from "drizzle-orm"
import { one, rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface ZaverkaAccount {
  ucet_cislo: string
  ucet_typ: string
  zustatek: Decimal
}

export interface Zaverka {
  typ: "ZAVERKA"
  aktiva: Decimal
  pasiva: Decimal
  naklady: Decimal
  vynosy: Decimal
  vysledek: Decimal
  ucty: ZaverkaAccount[]
}

export async function buildZaverka(
  db: RowExecutor,
  obdobiId: string,
): Promise<Zaverka> {
  const totals = await one<{
    aktiva: Decimal
    pasiva: Decimal
    naklady: Decimal
    vynosy: Decimal
    vysledek: Decimal
  }>(
    db,
    sql`
      WITH acct AS (
        SELECT u.typ,
               COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
                 - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS z
        FROM zapis_radek zr
        JOIN ucetni_zapis zp ON zr.zapis_id = zp.id
        JOIN ucet u          ON zr.ucet_id = u.id
        WHERE zp.obdobi_id = ${obdobiId}::uuid AND zp.regime = 'PODVOJNE' AND u.trida <> 7
        GROUP BY u.id, u.typ
      )
      SELECT
        COALESCE(SUM(z)  FILTER (WHERE typ = 'A'), 0) AS aktiva,
        COALESCE(SUM(-z) FILTER (WHERE typ = 'P'), 0) AS pasiva,
        COALESCE(SUM(z)  FILTER (WHERE typ = 'N'), 0) AS naklady,
        COALESCE(SUM(-z) FILTER (WHERE typ = 'V'), 0) AS vynosy,
        COALESCE(SUM(-z) FILTER (WHERE typ = 'V'), 0)
          - COALESCE(SUM(z) FILTER (WHERE typ = 'N'), 0) AS vysledek
      FROM acct
    `,
  )

  const ucty = await rows<ZaverkaAccount>(
    db,
    sql`
      SELECT u.cislo AS ucet_cislo, u.typ AS ucet_typ,
             COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
               - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS zustatek
      FROM zapis_radek zr
      JOIN ucetni_zapis zp ON zr.zapis_id = zp.id
      JOIN ucet u          ON zr.ucet_id = u.id
      WHERE zp.obdobi_id = ${obdobiId}::uuid AND zp.regime = 'PODVOJNE' AND u.trida <> 7
      GROUP BY u.id, u.cislo, u.typ
      ORDER BY u.cislo
    `,
  )

  return { typ: "ZAVERKA", ...totals, ucty }
}
