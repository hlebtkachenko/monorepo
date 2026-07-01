/**
 * Period output (UC-3). period_output is DERIVED from the read-model (R9), never
 * hand-entered, and only after R6 holds (every účetní případ of the period is
 * posted — also enforced by the period_output completeness trigger). The
 * period's regime selects the output type:
 *   DOUBLE_ENTRY  → FINANCIAL_STATEMENTS (rozvaha + VZZ, §18)
 *   SINGLE_ENTRY  → OVERVIEWS (§13b/3)
 *   TAX_RECORDS   → PERSONAL_INCOME_TAX (§7b ZDP)
 * Inserting a period_output row records (append-only) that the output was
 * produced for the period.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import type { OrgCtx } from "../types"
import { getPeriodRegime } from "../posting/index"
import { unpostedCases, type UnpostedCase } from "../invariants"
import { buildZaverka, type Zaverka } from "./zaverka"
import { buildPrehledy, type Prehledy } from "./prehledy"
import { buildDpfo, type Dpfo } from "./dpfo"
import { buildDppo, type Dppo } from "./dppo"
import { buildDph, type Dph } from "./dph"

export {
  buildZaverka,
  type Zaverka,
  type StatementLineRow,
  type ZaverkaTotals,
} from "./zaverka"
export { buildPrehledy, type Prehledy } from "./prehledy"
export { buildDpfo, type Dpfo } from "./dpfo"
export {
  buildDppo,
  computeIncomeTaxAdvances,
  NON_DEDUCTIBLE_CATALOGUE,
  type Dppo,
  type DppoInput,
} from "./dppo"
export {
  buildDph,
  type Dph,
  type DphRows,
  type KontrolniHlaseniTotals,
} from "./dph"
export {
  buildKontrolniHlaseni,
  KH_ROW_THRESHOLD,
  type KontrolniHlaseni,
  type KhRow,
  type KhAggregate,
} from "./kontrolni-hlaseni"
export {
  buildSouhrnneHlaseni,
  type SouhrnneHlaseni,
  type ShRow,
} from "./souhrnne-hlaseni"
export {
  buildStatementLayout,
  type StatementLayout,
  type LayoutLine,
  type StatementRozsah,
  type StatementUnit,
} from "./statement-layout"

export type OutputFigures = Zaverka | Prehledy | Dpfo

export interface GeneratedOutput {
  periodOutputId: string
  figures: OutputFigures
}

/** R6 gate error — thrown when a period still has unposted cases. */
export class UnpostedPeriodError extends Error {
  constructor(public readonly cases: UnpostedCase[]) {
    super(
      `accounting: cannot generate output — ${cases.length} case(s) in the period are not fully posted (R6 §8/3): ${cases
        .map((c) => c.event_designation)
        .join(", ")}`,
    )
    this.name = "UnpostedPeriodError"
  }
}

/**
 * Generate the period output: enforce R6, compute the regime's figures from the
 * read-model, and record an append-only period_output marker.
 */
export async function generateOutput(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { periodId: string; generatedBy: string },
): Promise<GeneratedOutput> {
  const unposted = await unpostedCases(db, input.periodId)
  if (unposted.length > 0) {
    throw new UnpostedPeriodError(unposted)
  }

  const regime = await getPeriodRegime(db, input.periodId)
  const figures: OutputFigures =
    regime === "DOUBLE_ENTRY"
      ? await buildZaverka(db, input.periodId)
      : regime === "SINGLE_ENTRY"
        ? await buildPrehledy(db, input.periodId)
        : await buildDpfo(db, input.periodId)

  const marker = await one<{ id: string }>(
    db,
    sql`INSERT INTO period_output (organization_id, period_id, type, generated_by)
        VALUES (${ctx.organizationId}::uuid, ${input.periodId}::uuid, ${figures.type}, ${input.generatedBy}::uuid)
        RETURNING id`,
  )

  return { periodOutputId: marker.id, figures }
}
