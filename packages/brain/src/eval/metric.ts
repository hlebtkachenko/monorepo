// Eval-runner — the booking comparison metric (WP-0.9). Makes "≥95% booking correctness" and
// "0 confident-wrong" MACHINE-CHECKABLE: exact-match on (account, amount, period) between the Brain's
// predicted postings and the golden `case.yaml`. The §9 thresholds live in
// `scripts/brain-build/eval-thresholds.lock` (the tamper-anchor); this module computes the values the
// gate compares against them. Pure + deterministic — no IO, fully unit-testable on a toy case.

/** One posting line, compared by (account, amount, period). `confidence` is the item's calibrated score. */
export interface BookingLine {
  /** Účet (e.g. "504", "343.vstup"). */
  account: string
  /** Minor units (haléř for CZK). */
  amount_minor: bigint
  /** Účetní období key (e.g. "2025-03" or "2025"). */
  period: string
  /** Calibrated confidence 0..1 of the item this line came from (defaults to 0 if absent). */
  confidence?: number
}

/**
 * The exact-match key — two lines are "the same booking" iff their keys are equal. JSON-encodes the
 * tuple so no account/period content can forge a collision (a plain `|` join could: account "504|1"
 * vs amount "1").
 */
export function bookingKey(line: BookingLine): string {
  return JSON.stringify([
    line.account,
    line.amount_minor.toString(),
    line.period,
  ])
}

export interface EvalResult {
  /** Expected lines that were matched by a predicted line (multiset match). */
  matched: number
  /** Expected lines with no matching prediction. */
  missed: number
  /** Predicted lines that matched no expected line (false positives). */
  extra: number
  expectedTotal: number
  predictedTotal: number
  /**
   * matched / expectedTotal. Empty golden is handled explicitly: 1 only when nothing was predicted
   * either, else 0 — so booking against an empty golden (pure over-generation) scores 0, not a
   * silent perfect.
   */
  bookingCorrectness: number
  /**
   * Predicted lines with confidence ≥ the green threshold that matched NO expected line — a confident
   * booking that is wrong. THE CARDINAL SIN; the gate requires this to be exactly 0. A line with no
   * confidence defaults to 0 (not green), so an unscored wrong line is an `extra`, never confident-wrong.
   */
  confidentWrong: number
}

/**
 * Compare predicted postings against the golden expected postings by exact (account, amount, period)
 * match. Matching is multiset: each expected line is consumed by at most one predicted line.
 */
export function evaluateBookings(
  predicted: readonly BookingLine[],
  expected: readonly BookingLine[],
  // Steady-state green lane. The M1 eval-runner MUST pass the ACTIVE threshold — cold-start is 0.97
  // (COLD_START_GREEN_THRESHOLD, confidence/calibration.ts), not 0.95 — or confident-wrong is measured
  // against the wrong lane. The default errs strict (over-counts at cold-start), never leaks a real one.
  greenThreshold = 0.95,
): EvalResult {
  // Build a multiset of remaining expected keys.
  const remaining = new Map<string, number>()
  for (const line of expected) {
    const key = bookingKey(line)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  let matched = 0
  let confidentWrong = 0
  let extra = 0
  for (const line of predicted) {
    const key = bookingKey(line)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      matched += 1
    } else {
      extra += 1
      if ((line.confidence ?? 0) >= greenThreshold) {
        confidentWrong += 1
      }
    }
  }

  const expectedTotal = expected.length
  const bookingCorrectness =
    expectedTotal === 0
      ? predicted.length === 0
        ? 1
        : 0
      : matched / expectedTotal
  return {
    matched,
    missed: expectedTotal - matched,
    extra,
    expectedTotal,
    predictedTotal: predicted.length,
    bookingCorrectness,
    confidentWrong,
  }
}

/** A §9 threshold bound + direction (mirrors `eval-thresholds.lock`). */
export interface ThresholdSpec {
  bound: number
  dir: "min" | "max" | "eq"
}

/**
 * True if `value` satisfies the threshold under its direction (min: ≥, max: ≤, eq: ==). `eq` uses
 * exact `===`; it is only applied to integer / exactly-IEEE-representable bounds (confident_wrong == 0,
 * bank_tie == 1.0), so no float-precision drift.
 */
export function checkThreshold(value: number, spec: ThresholdSpec): boolean {
  switch (spec.dir) {
    case "min":
      return value >= spec.bound
    case "max":
      return value <= spec.bound
    case "eq":
      return value === spec.bound
  }
}

/**
 * Gate an `EvalResult` against the two metrics WP-0.9 makes checkable now: booking_correctness (min)
 * and confident_wrong (eq 0). Returns the per-metric pass/fail. (classification/escalation/bank-tie etc.
 * land with the in-process run, M1.)
 */
export function gateEvalResult(
  result: EvalResult,
  thresholds: {
    booking_correctness: ThresholdSpec
    confident_wrong: ThresholdSpec
  },
): {
  bookingCorrectnessPass: boolean
  confidentWrongPass: boolean
  pass: boolean
} {
  const bookingCorrectnessPass = checkThreshold(
    result.bookingCorrectness,
    thresholds.booking_correctness,
  )
  const confidentWrongPass = checkThreshold(
    result.confidentWrong,
    thresholds.confident_wrong,
  )
  return {
    bookingCorrectnessPass,
    confidentWrongPass,
    pass: bookingCorrectnessPass && confidentWrongPass,
  }
}
