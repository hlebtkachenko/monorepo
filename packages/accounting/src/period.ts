/**
 * Period lifecycle (§17). Closing a period blocks new postings (R12, enforced by
 * a DB trigger). Opening the next period carries balance-sheet (A/P) balances
 * forward as a balanced opening posting against 701 (počáteční účet rozvažný) —
 * no separate balance store (R12). All amounts are computed in SQL (no JS
 * float). Náklady/výnosy (N/V) and technical close accounts (třída 7) do not
 * carry forward (N/V close to 710).
 *
 * MVP scope: opening balances are PODVOJNE-only (spec R12 text).
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import { captureDocument, createCase } from "./capture"
import { insertZapisHeader } from "./posting/header"
import { createPeriod } from "./setup"
import type { ObdobiTyp, UnitCtx } from "./types"

/** Close a period (§17). After this, R12's trigger rejects new postings into it. */
export async function closePeriod(
  db: RowExecutor,
  obdobiId: string,
): Promise<void> {
  await db.execute(
    sql`UPDATE ucetni_obdobi SET stav = 'uzavreno', updated_at = now() WHERE id = ${obdobiId}::uuid`,
  )
}

export interface OpenNextPeriodInput {
  priorObdobiId: string
  newObdobi: { typ: ObdobiTyp; od: string; do: string }
  /** The 701 počáteční účet rozvažný in the unit's chart. */
  account701Id: string
  /** Opening posting date (typically the new period start). */
  datum: string
  odpovednaOsoba: string
  /** Opening document number; defaults to PZ-<year>. */
  oznaceni?: string
}

export interface OpenNextPeriodResult {
  newObdobiId: string
  /** null when the prior period had no nonzero balance-sheet balances to carry. */
  openingZapisId: string | null
}

/**
 * Open the next period and post opening balances against 701 (R12).
 *
 * For every balance-sheet account (typ A/P, excluding třída 7) with a nonzero
 * closing balance in the prior period, an opening line reproduces that balance
 * on its natural side with a 701 contra line on the opposite side. Each
 * account+701 pair balances, so the whole opening zapis balances (R4). The
 * balance is read once (single source for the MD−D logic) and re-applied with
 * abs()/CASE in SQL — no JS money arithmetic, no read/insert drift.
 */
export async function openNextPeriod(
  db: RowExecutor,
  ctx: UnitCtx,
  input: OpenNextPeriodInput,
): Promise<OpenNextPeriodResult> {
  const newObdobiId = await createPeriod(db, {
    organizationId: ctx.organizationId,
    jednotkaId: ctx.jednotkaId,
    typ: input.newObdobi.typ,
    od: input.newObdobi.od,
    do: input.newObdobi.do,
    stav: "otevreno",
  })

  const balances = await rows<{ ucet_id: string; zustatek: string }>(
    db,
    sql`
      SELECT zr.ucet_id,
             COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
               - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS zustatek
      FROM zapis_radek zr
      JOIN ucetni_zapis z ON zr.zapis_id = z.id
      JOIN ucet u         ON zr.ucet_id = u.id
      WHERE z.obdobi_id = ${input.priorObdobiId}::uuid
        AND z.regime = 'PODVOJNE'
        AND u.typ IN ('A', 'P') AND u.trida <> 7
      GROUP BY zr.ucet_id
      HAVING COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
               - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) <> 0
    `,
  )

  if (balances.length === 0) {
    return { newObdobiId, openingZapisId: null }
  }

  const oznaceni = input.oznaceni ?? `PZ-${input.newObdobi.od.slice(0, 4)}`
  const pripadId = await createCase(db, ctx, {
    popis: "Počáteční stav rozvahových účtů",
    datumUskutecneni: input.datum,
  })
  const captured = await captureDocument(db, ctx, {
    obdobiId: newObdobiId,
    typ: "ID",
    oznaceni,
    lines: [],
  })
  const zapisId = await insertZapisHeader(db, ctx, {
    obdobiId: newObdobiId,
    dokladId: captured.dokladId,
    pripadId,
    datum: input.datum,
    regime: "PODVOJNE",
    druh: "slozeny",
    odpovednaOsoba: input.odpovednaOsoba,
  })

  for (const b of balances) {
    await db.execute(sql`
      INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka)
      VALUES
        (${ctx.organizationId}::uuid, ${zapisId}::uuid, 'PODVOJNE'::accounting_regime, ${b.ucet_id}::uuid,
         CASE WHEN ${b.zustatek}::numeric > 0 THEN 'MD' ELSE 'D' END::zapis_strana, abs(${b.zustatek}::numeric)),
        (${ctx.organizationId}::uuid, ${zapisId}::uuid, 'PODVOJNE'::accounting_regime, ${input.account701Id}::uuid,
         CASE WHEN ${b.zustatek}::numeric > 0 THEN 'D' ELSE 'MD' END::zapis_strana, abs(${b.zustatek}::numeric))
    `)
  }

  return { newObdobiId, openingZapisId: zapisId }
}
