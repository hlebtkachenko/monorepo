/**
 * Capture pipeline (UC-1 steps 1-3, shared by all regimes):
 *   ucetni_pripad (the fact) → ucetni_doklad (the voucher) → doklad_radek
 *   (lines, each documenting a case) → dilci_zaznam (money decomposition).
 *
 * "Pre-posting" stage — no ucetni_zapis yet (§33/5). Posting is UC-1 step 4
 * (see posting/). Call inside a withOrganization transaction.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import type {
  CapturedDocument,
  CaseInput,
  DocumentInput,
  UnitCtx,
} from "./types"

/** Create an ucetni_pripad — the economic fact (§6/1). Not a record. */
export async function createCase(
  db: RowExecutor,
  ctx: UnitCtx,
  input: CaseInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucetni_pripad (organization_id, jednotka_id, protistrana_id, popis, datum_uskutecneni, typ)
        VALUES (${ctx.organizationId}::uuid, ${ctx.jednotkaId}::uuid, ${input.protistranaId ?? null}, ${input.popis}, ${input.datumUskutecneni}::date, ${input.typ ?? null})
        RETURNING id`,
  )
  return r.id
}

/**
 * Capture a document with its lines and money decomposition (§11, §4/11, §33/5).
 * Each line references an existing ucetni_pripad (create those first via
 * createCase). Returns the doklad id and the created line/dílčí ids.
 */
export async function captureDocument(
  db: RowExecutor,
  ctx: UnitCtx,
  input: DocumentInput,
): Promise<CapturedDocument> {
  const doklad = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucetni_doklad (organization_id, jednotka_id, obdobi_id, protistrana_id, typ, oznaceni, okamzik_vyhotoveni)
        VALUES (${ctx.organizationId}::uuid, ${ctx.jednotkaId}::uuid, ${input.obdobiId}::uuid, ${input.protistranaId ?? null}, ${input.typ}, ${input.oznaceni}, COALESCE(${input.okamzikVyhotoveni ?? null}::timestamptz, now()))
        RETURNING id`,
  )

  const lines: CapturedDocument["lines"] = []
  for (const line of input.lines) {
    const radek = await one<{ id: string }>(
      db,
      sql`INSERT INTO doklad_radek (organization_id, doklad_id, pripad_id, popis, castka)
          VALUES (${ctx.organizationId}::uuid, ${doklad.id}::uuid, ${line.pripadId}::uuid, ${line.popis ?? null}, ${line.castka})
          RETURNING id`,
    )
    const dilciIds: string[] = []
    for (const d of line.dilci) {
      const dilci = await one<{ id: string }>(
        db,
        sql`INSERT INTO dilci_zaznam (organization_id, doklad_radek_id, druh, castka, dph_sazba, dph_castka)
            VALUES (${ctx.organizationId}::uuid, ${radek.id}::uuid, ${d.druh}, ${d.castka}, ${d.dphSazba ?? null}, ${d.dphCastka ?? null})
            RETURNING id`,
      )
      dilciIds.push(dilci.id)
    }
    lines.push({ radekId: radek.id, dilciIds })
  }

  return { dokladId: doklad.id, lines }
}
