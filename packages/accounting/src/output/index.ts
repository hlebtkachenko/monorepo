/**
 * Period output (UC-3). vystup is DERIVED from ledger / peněžní-deník balances
 * (R9), never hand-entered, and only after R6 holds (every case in the period is
 * fully posted). The unit's regime selects the output type:
 *   PODVOJNE        -> ZAVERKA (rozvaha + výsledovka, §18)
 *   JEDNODUCHE      -> PREHLEDY (§13b/3)
 *   DANOVA_EVIDENCE -> DPFO (§7b ZDP)
 * Creating a vystup row records that the output was produced for the period.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { UnitCtx } from "../types"
import { getUnitRegime } from "../posting/index"
import { unpostedCases } from "../invariants"
import { buildZaverka, type Zaverka } from "./zaverka"
import { buildPrehledy, type Prehledy } from "./prehledy"
import { buildDpfo, type Dpfo } from "./dpfo"

export { buildZaverka, type Zaverka, type ZaverkaAccount } from "./zaverka"
export { buildPrehledy, type Prehledy } from "./prehledy"
export { buildDpfo, type Dpfo } from "./dpfo"

export type OutputFigures = Zaverka | Prehledy | Dpfo

export interface GeneratedOutput {
  vystupId: string
  figures: OutputFigures
}

/** R6 gate error — thrown when a period still has unposted cases. */
export class UnpostedPeriodError extends Error {
  constructor(public readonly cases: { pripad_id: string; popis: string }[]) {
    super(
      `accounting: cannot generate output — ${cases.length} case(s) in the period are not fully posted (R6): ${cases
        .map((c) => c.popis)
        .join(", ")}`,
    )
    this.name = "UnpostedPeriodError"
  }
}

/**
 * Generate the period output for a unit. Enforces R6, computes the regime's
 * figures from balances, and records a vystup marker row.
 */
export async function generateOutput(
  db: RowExecutor,
  ctx: UnitCtx,
  obdobiId: string,
): Promise<GeneratedOutput> {
  const unposted = await unpostedCases(db, obdobiId)
  if (unposted.length > 0) {
    throw new UnpostedPeriodError(unposted)
  }

  const regime = await getUnitRegime(db, ctx.jednotkaId)
  const figures: OutputFigures =
    regime === "PODVOJNE"
      ? await buildZaverka(db, obdobiId)
      : regime === "JEDNODUCHE"
        ? await buildPrehledy(db, obdobiId)
        : await buildDpfo(db, obdobiId)

  const vystup = await one<{ id: string }>(
    db,
    sql`INSERT INTO vystup (organization_id, jednotka_id, obdobi_id, typ)
        VALUES (${ctx.organizationId}::uuid, ${ctx.jednotkaId}::uuid, ${obdobiId}::uuid, ${figures.typ})
        RETURNING id`,
  )

  return { vystupId: vystup.id, figures }
}
