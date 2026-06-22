/**
 * Corrections (R8, ČÚS 001 §35). Posted entries are never edited or deleted
 * (the DB blocks UPDATE/DELETE); a correction is a NEW ucetni_zapis linked to
 * the original via opravuje_zapis_id. A storno reverses the original with
 * negative amounts on the same sides — the Czech convention — and must be posted
 * into an OPEN period (the DB rejects a closed-period posting). The original
 * stays visible. A doplňkový (supplementary) correction is just a normal posting
 * with opravujeZapisId + opravaTyp set (see posting/).
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import type { Regime, UnitCtx } from "./types"
import { insertZapisHeader } from "./posting/header"

export interface StornoInput {
  /** The posted entry being reversed. */
  originalZapisId: string
  /** OPEN period to post the storno into (typically where the error is found). */
  obdobiId: string
  datum: string
  odpovednaOsoba: string
}

/**
 * Úplné storno: fully reverse a posted entry as a new linked entry with negated
 * lines (same accounts/sides/classification, negative amounts). Reverses both
 * PODVOJNE (zapis_radek) and cash-book (penezni_denik_radek) postings.
 */
export async function stornoEntry(
  db: RowExecutor,
  ctx: UnitCtx,
  input: StornoInput,
): Promise<{ zapisId: string }> {
  const orig = await one<{
    regime: Regime
    doklad_id: string
    pripad_id: string
  }>(
    db,
    sql`SELECT regime, doklad_id, pripad_id FROM ucetni_zapis WHERE id = ${input.originalZapisId}::uuid`,
  )

  const zapisId = await insertZapisHeader(db, ctx, {
    obdobiId: input.obdobiId,
    dokladId: orig.doklad_id,
    pripadId: orig.pripad_id,
    datum: input.datum,
    regime: orig.regime,
    druh: "slozeny",
    odpovednaOsoba: input.odpovednaOsoba,
    opravujeZapisId: input.originalZapisId,
    opravaTyp: "storno",
  })

  if (orig.regime === "PODVOJNE") {
    await db.execute(sql`
      INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, strana, castka)
      SELECT ${ctx.organizationId}::uuid, ${zapisId}::uuid, 'PODVOJNE'::accounting_regime, ucet_id, strana, -castka
      FROM zapis_radek WHERE zapis_id = ${input.originalZapisId}::uuid
    `)
  } else {
    await db.execute(sql`
      INSERT INTO penezni_denik_radek
        (organization_id, zapis_id, regime, kategorie_id, misto, smer, danovy, prubezny, zaklad_dane, castka)
      SELECT ${ctx.organizationId}::uuid, ${zapisId}::uuid, regime, kategorie_id, misto, smer, danovy, prubezny,
             CASE WHEN zaklad_dane IS NULL THEN NULL ELSE -zaklad_dane END, -castka
      FROM penezni_denik_radek WHERE zapis_id = ${input.originalZapisId}::uuid
    `)
  }

  return { zapisId }
}
