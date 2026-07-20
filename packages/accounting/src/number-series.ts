/**
 * Gapless číselné řady (§11/1a). A government-shared Označení (the invoice
 * number, the inventární číslo) must be GAPLESS — a SEQUENCE is illegal because
 * a rolled-back transaction would burn a number and leave a hole.
 *
 * Allocation is a single `UPDATE … RETURNING`: the UPDATE takes a row lock for
 * the duration of the statement, so concurrent allocations serialize and every
 * committed allocation is contiguous. The formatted Označení string is FROZEN
 * onto the consuming row (event / document / asset / inventory_count) so a later
 * edit of the series pattern can never mutate an already-issued government id.
 *
 * A DOCUMENT série may be configured PER účetní období through
 * `number_series_period` (the Dokladové řady editor): each period row has its own
 * format (prefix + zero-padded length + postfix) and its own gapless counter, so
 * a new period restarts the sequence. When a `periodId` is supplied and the série
 * has a matching period row, allocation advances THAT row's counter (still one
 * row lock, gapless per (série, period)). A série with no period rows — every
 * EVENT / ASSET / INVENTORY_COUNT série, and a not-yet-configured DOCUMENT série —
 * keeps advancing the flat `number_series.next_number` unchanged.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"

export interface AllocatedNumber {
  sequenceNumber: number
  designation: string
}

type EntityType = "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT"

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
 * Compose a `number_series_period` row (prefix + zero-padded length + postfix)
 * into the same pattern grammar `formatDesignation` consumes, so period-based and
 * flat série share one formatter. e.g. prefix 'PF', length 4, postfix '/{YYYY}'
 * → 'PF{NNNN}/{YYYY}'.
 */
function periodPattern(
  prefix: string,
  postfix: string,
  numberLength: number,
): string {
  return `${prefix}{${"N".repeat(numberLength)}}${postfix}`
}

interface PeriodRow {
  sequence_number: string
  prefix: string
  postfix: string
  number_length: number
}

/**
 * Allocate the next gapless number on a série and return the sequence + the
 * frozen Označení. `isoDate` feeds the date tokens in the pattern (typically the
 * document's issued_at / the event's occurred_at). `expectedEntityType` guards
 * the row's entity_type so a série can only be burned by its own entity kind.
 *
 * When `periodId` is supplied AND the série has a `number_series_period` row for
 * that period, the per-period counter is advanced (restarts per účetní období).
 * A série with no period rows falls back to the flat `next_number` path. A série
 * that HAS period rows but none for `periodId` is a misconfiguration and throws.
 */
export async function allocateNumber(
  db: RowExecutor,
  seriesId: string,
  isoDate: string,
  expectedEntityType: EntityType,
  periodId?: string,
): Promise<AllocatedNumber> {
  if (periodId !== undefined) {
    const period = await rows<PeriodRow>(
      db,
      sql`UPDATE number_series_period p
             SET current_number = current_number + 1, updated_at = now()
            FROM number_series s
           WHERE p.number_series_id = ${seriesId}::uuid
             AND p.period_id = ${periodId}::uuid
             AND s.id = p.number_series_id
             AND s.entity_type = ${expectedEntityType}::number_series_entity
          RETURNING p.current_number - 1 AS sequence_number,
                    p.prefix, p.postfix, p.number_length`,
    )
    const pr = period[0]
    if (pr !== undefined) {
      const seq = Number(pr.sequence_number)
      return {
        sequenceNumber: seq,
        designation: formatDesignation(
          periodPattern(pr.prefix, pr.postfix, pr.number_length),
          seq,
          isoDate,
        ),
      }
    }
    // Zero rows: distinguish wrong-entity vs not-found vs flat série vs
    // period-configured série missing THIS period (a real misconfiguration).
    const meta = await rows<{ entity_type: EntityType; has_periods: boolean }>(
      db,
      sql`SELECT s.entity_type,
                 EXISTS (SELECT 1 FROM number_series_period pp
                          WHERE pp.number_series_id = s.id) AS has_periods
            FROM number_series s
           WHERE s.id = ${seriesId}::uuid`,
    )
    const m = meta[0]
    if (m === undefined) {
      throw new Error(`accounting: number series ${seriesId} not found`)
    }
    if (m.entity_type !== expectedEntityType) {
      throw new Error(
        `accounting: number series ${seriesId} is ${m.entity_type}, not ${expectedEntityType} (§11/1a gapless series must match its entity kind)`,
      )
    }
    if (m.has_periods) {
      throw new Error(
        `accounting: number series ${seriesId} has no dokladová řada row for účetní období ${periodId} — configure the period before allocating`,
      )
    }
    // Flat série: fall through to the flat path below.
  }

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

/**
 * Format the NEXT Označení a série would allocate WITHOUT advancing the counter —
 * the Dokladové řady "test format" affordance. Reads the per-period row when
 * `periodId` matches one, else the flat pattern.
 */
export async function previewNextNumber(
  db: RowExecutor,
  seriesId: string,
  isoDate: string,
  periodId?: string,
): Promise<string> {
  if (periodId !== undefined) {
    const period = await rows<{
      current_number: string
      prefix: string
      postfix: string
      number_length: number
    }>(
      db,
      sql`SELECT current_number, prefix, postfix, number_length
            FROM number_series_period
           WHERE number_series_id = ${seriesId}::uuid
             AND period_id = ${periodId}::uuid`,
    )
    const pr = period[0]
    if (pr !== undefined) {
      return formatDesignation(
        periodPattern(pr.prefix, pr.postfix, pr.number_length),
        Number(pr.current_number),
        isoDate,
      )
    }
  }
  const flat = await rows<{ next_number: string; pattern: string }>(
    db,
    sql`SELECT next_number, pattern FROM number_series WHERE id = ${seriesId}::uuid`,
  )
  const r = flat[0]
  if (r === undefined) {
    throw new Error(`accounting: number series ${seriesId} not found`)
  }
  return formatDesignation(r.pattern, Number(r.next_number), isoDate)
}
