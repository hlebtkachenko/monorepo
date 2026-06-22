/**
 * Double-entry posting (PODVOJNE §13). Creates the shared ucetni_zapis header
 * plus its zapis_radek Má dáti/Dal lines. The DB enforces balance + non-empty
 * (R4) via a deferred constraint trigger at COMMIT, so the caller must run this
 * inside one withOrganization transaction. castka may be negative (storno on
 * the original sides, ČÚS 001).
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { DoubleEntryInput, PostedEntry, UnitCtx } from "../types"
import { insertZapisHeader } from "./header"

export async function postDoubleEntry(
  db: RowExecutor,
  ctx: UnitCtx,
  input: DoubleEntryInput,
): Promise<PostedEntry> {
  const zapisId = await insertZapisHeader(db, ctx, {
    obdobiId: input.obdobiId,
    dokladId: input.dokladId,
    pripadId: input.pripadId,
    datum: input.datum,
    regime: "PODVOJNE",
    druh: input.lines.length === 2 ? "jednoduchy" : "slozeny",
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
      sql`INSERT INTO zapis_radek (organization_id, zapis_id, regime, ucet_id, dilci_id, strana, castka)
          VALUES (${ctx.organizationId}::uuid, ${zapisId}::uuid, 'PODVOJNE', ${line.ucetId}::uuid, ${line.dilciId ?? null}, ${line.strana}, ${line.castka})
          RETURNING id`,
    )
    lineIds.push(radek.id)
  }

  return { zapisId, lineIds }
}
