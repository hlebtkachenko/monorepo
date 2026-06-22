/**
 * Cash-book posting (JEDNODUCHE §13b / DANOVA_EVIDENCE §7b). Creates the shared
 * ucetni_zapis header plus its penezni_denik_radek classified rows (§9). A
 * single cash movement may need several rows (multiple categories, base vs VAT,
 * průběžné položky for own-account transfers) — pass them all.
 *
 * For DANOVA_EVIDENCE the ucetni_zapis is a technical container, not a legal
 * účetní zápis (§7b ZDP). Run inside one withOrganization transaction.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { CashEntryInput, PostedEntry, UnitCtx } from "../types"
import { insertZapisHeader } from "./header"

export async function postCashEntry(
  db: RowExecutor,
  ctx: UnitCtx,
  input: CashEntryInput,
): Promise<PostedEntry> {
  const zapisId = await insertZapisHeader(db, ctx, {
    obdobiId: input.obdobiId,
    dokladId: input.dokladId,
    pripadId: input.pripadId,
    datum: input.datum,
    regime: input.regime,
    druh: input.lines.length === 1 ? "jednoduchy" : "slozeny",
    odpovednaOsoba: input.odpovednaOsoba,
    odpisovyPlanId: input.odpisovyPlanId,
    inventuraId: input.inventuraId,
    opravujeZapisId: input.opravujeZapisId,
    opravaTyp: input.opravaTyp,
  })

  const lineIds: string[] = []
  for (const line of input.lines) {
    const radek = await one<{ id: string }>(
      db,
      sql`INSERT INTO penezni_denik_radek
            (organization_id, zapis_id, regime, dilci_id, kategorie_id, misto, smer, danovy, prubezny, zaklad_dane, castka)
          VALUES
            (${ctx.organizationId}::uuid, ${zapisId}::uuid, ${input.regime}, ${line.dilciId ?? null}, ${line.kategorieId ?? null},
             ${line.misto}, ${line.smer}, ${line.danovy}, ${line.prubezny ?? false}, ${line.zakladDane ?? null}, ${line.castka})
          RETURNING id`,
    )
    lineIds.push(radek.id)
  }

  return { zapisId, lineIds }
}
