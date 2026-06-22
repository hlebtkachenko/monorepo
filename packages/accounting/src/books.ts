/**
 * Books as queries (UC-2). The accounting books are SQL views over the posting
 * lines (§13, §13b): deník (by time), hlavní kniha (by account), knihy
 * analytických / podrozvahových účtů, and the peněžní deník. Each view is
 * organization-scoped (security_invoker + FORCE RLS) and regime-filtered. These
 * are all-time views for browsing; period output (UC-3) is period-scoped — see
 * output/.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { Decimal, Misto, Smer, Strana } from "./types"

export interface DenikRow {
  zapis_id: string
  datum: string
  doklad_id: string
  doklad_typ: string
  doklad_oznaceni: string
  pripad_id: string
  zapis_radek_id: string
  ucet_id: string
  ucet_cislo: string
  strana: Strana
  castka: Decimal
}

export interface UcetBalanceRow {
  ucet_id: string
  ucet_cislo: string
  ucet_typ?: string
  parent_id?: string | null
  synteticky_ucet_id?: string | null
  md_total: Decimal
  d_total: Decimal
  zustatek?: Decimal
}

export interface PenezniDenikRow {
  zapis_id: string
  datum: string
  regime: string
  doklad_id: string
  radek_id: string
  misto: Misto
  smer: Smer
  danovy: boolean
  prubezny: boolean
  kategorie_id: string | null
  kategorie_typ: string | null
  kategorie_nazev: string | null
  zaklad_dane: Decimal | null
  castka: Decimal
}

/** deník — postings in chronological order (PODVOJNE §13). */
export function denik(db: RowExecutor): Promise<DenikRow[]> {
  return rows<DenikRow>(
    db,
    sql`SELECT * FROM v_denik ORDER BY datum, zapis_id, zapis_radek_id`,
  )
}

/** hlavní kniha — balances grouped by account (PODVOJNE §13). */
export function hlavniKniha(db: RowExecutor): Promise<UcetBalanceRow[]> {
  return rows<UcetBalanceRow>(
    db,
    sql`SELECT * FROM v_hlavni_kniha ORDER BY ucet_cislo`,
  )
}

/** kniha analytických účtů — analytical accounts (§16). */
export function knihaAnalytickych(db: RowExecutor): Promise<UcetBalanceRow[]> {
  return rows<UcetBalanceRow>(
    db,
    sql`SELECT * FROM v_kniha_analytickych_uctu ORDER BY ucet_cislo`,
  )
}

/** kniha podrozvahových účtů — off-balance accounts (§13). */
export function knihaPodrozvahovych(
  db: RowExecutor,
): Promise<UcetBalanceRow[]> {
  return rows<UcetBalanceRow>(
    db,
    sql`SELECT * FROM v_kniha_podrozvahovych_uctu ORDER BY ucet_cislo`,
  )
}

/** peněžní deník — classified cash-book rows (JEDNODUCHE §13b / DANOVA_EVIDENCE §7b). */
export function penezniDenik(db: RowExecutor): Promise<PenezniDenikRow[]> {
  return rows<PenezniDenikRow>(
    db,
    sql`SELECT * FROM v_penezni_denik ORDER BY datum, zapis_id`,
  )
}
