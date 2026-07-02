/**
 * Gapless číselné řady (§11/1a). A government-shared Označení (the invoice
 * number, the inventární číslo) must be GAPLESS — a SEQUENCE is illegal because
 * a rolled-back transaction would burn a number and leave a hole.
 *
 * Allocation is a single `UPDATE … RETURNING` on the number_series row: the
 * UPDATE takes a row lock for the duration of the statement, so concurrent
 * allocations serialize and every committed allocation is contiguous. The
 * formatted Označení string is FROZEN onto the consuming row (event / document /
 * asset / inventory_count) so a later edit of the series pattern can never
 * mutate an already-issued government id.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"

export interface AllocatedNumber {
  sequenceNumber: number
  designation: string
}

/**
 * Render a number_series pattern into the frozen Označení string.
 *
 * Supported tokens: `{YYYY}` `{YY}` `{MM}` (from the reference date) and a run
 * of `{N…}` (the zero-padded sequence number, width = number of N's). Any other
 * literal text passes through verbatim. Example: 'FP{YYYY}{NNNN}', seq 7,
 * 2026-03-01 → 'FP20260007'.
 */
export function formatDesignation(
  pattern: string,
  seq: number,
  isoDate: string,
): string {
  const d = isoDate.slice(0, 10)
  return pattern
    .replace(/\{YYYY\}/g, d.slice(0, 4))
    .replace(/\{YY\}/g, d.slice(2, 4))
    .replace(/\{MM\}/g, d.slice(5, 7))
    .replace(/\{N+\}/g, (token) => String(seq).padStart(token.length - 2, "0"))
}

/**
 * Allocate the next gapless number on a series and return the sequence + the
 * frozen Označení. `isoDate` feeds the date tokens in the pattern (typically the
 * document's issued_at / the event's occurred_at). `expectedEntityType` guards
 * the row's entity_type so a series can only be burned by its own entity kind.
 */
export async function allocateNumber(
  db: RowExecutor,
  seriesId: string,
  isoDate: string,
  expectedEntityType: "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT",
): Promise<AllocatedNumber> {
  const result = await rows<{ sequence_number: string; pattern: string }>(
    db,
    sql`UPDATE number_series
           SET next_number = next_number + 1, updated_at = now()
         WHERE id = ${seriesId}::uuid
           AND entity_type = ${expectedEntityType}::number_series_entity
        RETURNING next_number - 1 AS sequence_number, pattern`,
  )
  const r = result[0]
  if (r === undefined) {
    throw new Error(
      `accounting: number series ${seriesId} not found or not of type ${expectedEntityType} (§11/1a gapless series must match its entity kind)`,
    )
  }
  const seq = Number(r.sequence_number)
  return {
    sequenceNumber: seq,
    designation: formatDesignation(r.pattern, seq, isoDate),
  }
}
