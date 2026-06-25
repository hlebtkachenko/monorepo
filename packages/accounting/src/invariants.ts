/**
 * Cross-cutting invariants enforced/queried at the service layer:
 *   R5  Σ analytical accounts = synthetic account (§16) — reconcile helper.
 *   R6  every case in a period must be fully posted before output (§8/3) —
 *       defined as: every dilci_zaznam under the period's documents is
 *       referenced by a posting line. The gate returns the unposted cases.
 *   R11 bidirectional audit trail: output figure → účet → zápis → doklad →
 *       případ, and případ → its postings.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { Decimal, Strana } from "./types"

export interface UnpostedCase {
  pripad_id: string
  popis: string
  unposted_dilci: number
}

/**
 * R6 gate. Returns the cases in `obdobiId` that have at least one dilci_zaznam
 * not yet referenced by any posting line. The period is fully posted iff this
 * returns []. Period membership is via doklad_radek -> ucetni_doklad.obdobi_id.
 */
export function unpostedCases(
  db: RowExecutor,
  obdobiId: string,
): Promise<UnpostedCase[]> {
  return rows<UnpostedCase>(
    db,
    sql`
      SELECT p.id AS pripad_id, p.popis, count(*)::int AS unposted_dilci
      FROM ucetni_pripad p
      JOIN doklad_radek dr   ON dr.pripad_id = p.id
      JOIN ucetni_doklad dok ON dok.id = dr.doklad_id AND dok.obdobi_id = ${obdobiId}::uuid
      JOIN dilci_zaznam dz   ON dz.doklad_radek_id = dr.id
      WHERE NOT EXISTS (SELECT 1 FROM zapis_radek zr WHERE zr.dilci_id = dz.id)
        AND NOT EXISTS (SELECT 1 FROM penezni_denik_radek pdr WHERE pdr.dilci_id = dz.id)
      GROUP BY p.id, p.popis
      ORDER BY p.id
    `,
  )
}

export interface AnalyticalReconcile {
  synteticky_ucet_id: string
  analytical_sum: Decimal
  /** Balance posted directly to the synthetic account (should be 0 when analytics are used). */
  synthetic_direct: Decimal
  reconciles: boolean
}

/**
 * R5 (§16). For each synthetic account that has analytical children, returns the
 * sum of the children's balances and any balance posted directly to the
 * synthetic; `reconciles` is true when no balance bypasses the analytics
 * (synthetic_direct = 0). Best practice posts only to analytical accounts.
 */
export function reconcileAnalytics(
  db: RowExecutor,
): Promise<AnalyticalReconcile[]> {
  return rows<AnalyticalReconcile>(
    db,
    sql`
      WITH analytical AS (
        SELECT synteticky_ucet_id AS parent_id, SUM(zustatek) AS analytical_sum
        FROM v_kniha_analytickych_uctu
        GROUP BY synteticky_ucet_id
      ),
      direct AS (
        SELECT u.id AS parent_id,
               COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
                 - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS synthetic_direct
        FROM ucet u
        LEFT JOIN zapis_radek zr ON zr.ucet_id = u.id
        GROUP BY u.id
      )
      SELECT a.parent_id AS synteticky_ucet_id,
             a.analytical_sum,
             COALESCE(d.synthetic_direct, 0) AS synthetic_direct,
             (COALESCE(d.synthetic_direct, 0) = 0) AS reconciles
      FROM analytical a
      LEFT JOIN direct d ON d.parent_id = a.parent_id
      ORDER BY a.parent_id
    `,
  )
}

export interface TraceRow {
  zapis_id: string
  zapis_radek_id: string
  strana: Strana
  castka: Decimal
  datum: string
  doklad_id: string
  doklad_oznaceni: string
  pripad_id: string
  pripad_popis: string
}

/**
 * R11 forward trace: from an output figure (an account balance) list the
 * contributing zápisy → doklad → případ.
 */
export function traceAccount(
  db: RowExecutor,
  ucetId: string,
): Promise<TraceRow[]> {
  return rows<TraceRow>(
    db,
    sql`
      SELECT z.id AS zapis_id, zr.id AS zapis_radek_id, zr.strana, zr.castka,
             z.datum, d.id AS doklad_id, d.oznaceni AS doklad_oznaceni,
             p.id AS pripad_id, p.popis AS pripad_popis
      FROM zapis_radek zr
      JOIN ucetni_zapis z   ON zr.zapis_id = z.id
      JOIN ucetni_doklad d  ON z.doklad_id = d.id
      JOIN ucetni_pripad p  ON z.pripad_id = p.id
      WHERE zr.ucet_id = ${ucetId}::uuid
      ORDER BY z.datum, z.id
    `,
  )
}

export interface CasePostingRow {
  zapis_id: string
  datum: string
  regime: string
  doklad_oznaceni: string
}

/**
 * R11 reverse trace: from a případ list every posting (ucetni_zapis) that
 * records it.
 */
export function tracePripad(
  db: RowExecutor,
  pripadId: string,
): Promise<CasePostingRow[]> {
  return rows<CasePostingRow>(
    db,
    sql`
      SELECT z.id AS zapis_id, z.datum, z.regime, d.oznaceni AS doklad_oznaceni
      FROM ucetni_zapis z
      JOIN ucetni_doklad d ON z.doklad_id = d.id
      WHERE z.pripad_id = ${pripadId}::uuid
      ORDER BY z.datum, z.id
    `,
  )
}
