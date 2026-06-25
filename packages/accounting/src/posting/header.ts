/**
 * Single home for the ucetni_zapis header INSERT, shared by the double-entry and
 * cash-book posting engines, the period opening posting, and corrections. A new
 * header column is added here once, not in four places.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { OpravaTyp, Regime, UnitCtx } from "../types"

export interface ZapisHeaderInput {
  obdobiId: string
  dokladId: string
  pripadId: string
  datum: string
  regime: Regime
  druh: "jednoduchy" | "slozeny"
  odpovednaOsoba: string
  odpisovyPlanId?: string | null
  inventuraId?: string | null
  opravujeZapisId?: string | null
  opravaTyp?: OpravaTyp | null
}

/** Insert one ucetni_zapis header and return its id. */
export async function insertZapisHeader(
  db: RowExecutor,
  ctx: UnitCtx,
  h: ZapisHeaderInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucetni_zapis
          (organization_id, jednotka_id, obdobi_id, doklad_id, pripad_id,
           odpisovy_plan_id, inventura_id, opravuje_zapis_id, oprava_typ,
           datum, regime, druh, odpovedna_osoba, okamzik_zauctovani)
        VALUES
          (${ctx.organizationId}::uuid, ${ctx.jednotkaId}::uuid, ${h.obdobiId}::uuid,
           ${h.dokladId}::uuid, ${h.pripadId}::uuid,
           ${h.odpisovyPlanId ?? null}, ${h.inventuraId ?? null},
           ${h.opravujeZapisId ?? null}, ${h.opravaTyp ?? null},
           ${h.datum}::date, ${h.regime}, ${h.druh}, ${h.odpovednaOsoba}::uuid, now())
        RETURNING id`,
  )
  return r.id
}
