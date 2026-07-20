/**
 * FX rate resolution + conversion — the rate-FETCH half of the FX story.
 *
 * The posting engine (engine.ts) and capture (capture.ts) consume a rate that is
 * frozen per transaction; they never look one up. This module is the missing
 * source: it resolves the rate for a currency pair on an exact date from the
 * stored tables (migration 0072), following the ADR-0013 precedence
 *
 *     org override (fx_rate_override) -> shared ČNB fix (fx_rate) -> error
 *
 * and never inverts a known rate, never substitutes a neighbour date.
 *
 * QUOTING (množství): a stored rate is quoted PER `unitAmount` units of the
 * from-currency (ČNB "množství", e.g. 2900 CZK per 100 GBP). `convertAmount`
 * divides by `unitAmount`, so it is correct for any množství. But
 * `partial_record.fx_rate` (where capture freezes a rate) has NO unit column and
 * expects a PER-1 rate (29.0, not 2900). Therefore:
 *
 *   - to convert an amount now: `convertAmount(db, amount, resolved)`.
 *   - to FREEZE a resolved rate onto `partial_record.fx_rate`: use
 *     `effectiveRate(db, resolved)` (rate / unitAmount) — NEVER the raw
 *     `resolved.rate`, or a per-100 currency books 100× wrong.
 *
 * The rounding equivalence with capture.ts's `round(x, 4)` holds only at
 * `unitAmount = 1`; the division reconciles every other case. All money/rate
 * arithmetic is done in SQL (numeric), never in TypeScript (R13) — a JS float
 * division of e.g. 6.523/100 would already corrupt the rate. `Decimal` is a
 * decimal string throughout (types.ts).
 */

import { sql } from "drizzle-orm"
import { one, rows } from "../sql"
import type { ReadExecutor } from "../sql"
import type { Decimal, FxRateKind } from "../types"

/** No usable rate for a pair/date — the caller supplies a manual override or waits (ADR-0013). */
export class FxRateNotFoundError extends Error {
  constructor(
    readonly fromCode: string,
    readonly toCode: string,
    readonly on: string,
    readonly kind: FxRateKind,
  ) {
    super(
      `accounting/fx: no rate for ${fromCode}->${toCode} on ${on} (${kind}). ` +
        `Rates are never inverted and never taken from a neighbouring date ` +
        `(ADR-0013) — enter a manual fx_rate_override or import the ČNB fix.`,
    )
    this.name = "FxRateNotFoundError"
  }
}

export interface ResolvedFxRate {
  fromCode: string
  toCode: string
  /** The exact date the rate is valid for (ISO YYYY-MM-DD). */
  rateDate: string
  rateKind: FxRateKind
  /**
   * The stored rate: to-currency per `unitAmount` units of the from-currency
   * (a decimal string). NOT a per-1 rate for množství currencies — divide by
   * `unitAmount` (use `effectiveRate`) before freezing it onto partial_record.
   */
  rate: Decimal
  /** ČNB "množství" — the from-currency unit count the rate is quoted per (e.g. 100 JPY). */
  unitAmount: number
  /** "override" | the shared row's source (e.g. "CNB") | "identity" for same-currency. */
  source: string
}

export interface FxRateQuery {
  fromCode: string
  toCode: string
  /** ISO date (YYYY-MM-DD). Matched EXACTLY — never a neighbouring date (ADR-0013). */
  on: string
  /** Defaults to DAILY (the ČNB denní kurz). */
  kind?: FxRateKind
}

interface RateRow {
  rate: Decimal
  unit_amount: number
  source: string
}

/**
 * Resolve the exchange rate for a currency pair on an exact date: an org override
 * beats the shared ČNB rate at the same (pair, date, kind); a missing rate throws
 * `FxRateNotFoundError`. Never inverts, never substitutes a neighbour date.
 */
export async function resolveFxRate(
  db: ReadExecutor,
  q: FxRateQuery,
): Promise<ResolvedFxRate> {
  const kind: FxRateKind = q.kind ?? "DAILY"

  // 1. org override (RLS-scoped; the natural-unique makes it at most one row).
  const overrides = await rows<RateRow>(
    db,
    sql`SELECT rate::text AS rate, unit_amount, 'override' AS source
          FROM fx_rate_override
         WHERE from_code = ${q.fromCode} AND to_code = ${q.toCode}
           AND rate_date = ${q.on}::date AND rate_kind = ${kind}
         LIMIT 1`,
  )
  // 2. shared reference; the ČNB fix is the legal default, so it wins over any
  // other source deterministically rather than by alphabet.
  const chosen =
    overrides[0] ??
    (
      await rows<RateRow>(
        db,
        sql`SELECT rate::text AS rate, unit_amount, source
              FROM fx_rate
             WHERE from_code = ${q.fromCode} AND to_code = ${q.toCode}
               AND rate_date = ${q.on}::date AND rate_kind = ${kind}
             ORDER BY (source <> 'CNB'), source
             LIMIT 1`,
      )
    )[0]

  if (!chosen) throw new FxRateNotFoundError(q.fromCode, q.toCode, q.on, kind)

  return {
    fromCode: q.fromCode,
    toCode: q.toCode,
    rateDate: q.on,
    rateKind: kind,
    rate: chosen.rate,
    unitAmount: chosen.unit_amount,
    source: chosen.source,
  }
}

/**
 * The per-1 effective rate (`rate / unitAmount`), rounded to 6 dp in SQL — the
 * ONLY sanctioned value to freeze onto `partial_record.fx_rate` (which has no
 * unit_amount column). Never divide in TypeScript: a float 6.523/100 is inexact.
 */
export async function effectiveRate(
  db: ReadExecutor,
  rate: ResolvedFxRate,
): Promise<Decimal> {
  const r = await one<{ v: string }>(
    db,
    sql`SELECT round(${rate.rate}::numeric / ${rate.unitAmount}::numeric, 6)::text AS v`,
  )
  return r.v
}

/**
 * Apply a resolved rate to an amount: `amount * rate / unitAmount`, computed in
 * SQL and rounded to 4 dp (numeric(19,4) money precision) with the same Postgres
 * `round` (half-away-from-zero) capture.ts uses. Correct for any množství.
 */
export async function convertAmount(
  db: ReadExecutor,
  amount: Decimal,
  rate: ResolvedFxRate,
): Promise<Decimal> {
  const r = await one<{ v: string }>(
    db,
    sql`SELECT round(${amount}::numeric * ${rate.rate}::numeric / ${rate.unitAmount}::numeric, 4)::text AS v`,
  )
  return r.v
}

/**
 * Resolve + convert in one call. Same-currency short-circuits to the input at
 * rate 1 (no lookup); otherwise resolves per the override->ČNB->error precedence.
 */
export async function convertAmountAt(
  db: ReadExecutor,
  amount: Decimal,
  q: FxRateQuery,
): Promise<{ amount: Decimal; rate: ResolvedFxRate }> {
  if (q.fromCode === q.toCode) {
    return {
      amount,
      rate: {
        fromCode: q.fromCode,
        toCode: q.toCode,
        rateDate: q.on,
        rateKind: q.kind ?? "DAILY",
        rate: "1",
        unitAmount: 1,
        source: "identity",
      },
    }
  }
  const rate = await resolveFxRate(db, q)
  return { amount: await convertAmount(db, amount, rate), rate }
}
