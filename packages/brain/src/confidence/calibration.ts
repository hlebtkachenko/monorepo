// Step 6 — calibration mapping (D6 §"Step 6" + §"Calibration and anti-gaming"), copied verbatim.
// "95% confidence" means nothing unless it empirically predicts 95% correctness. The raw score is
// mapped to a calibrated score by a MONOTONE ISOTONIC REGRESSION (PAV) fitted on historical
// {score, correct?} pairs. Until N >= 10 production runs there is no data to fit, so the map is the
// IDENTITY and the green threshold is held conservatively at 0.97 (vs the calibrated 0.95) for a
// cold-start safety margin. The map is held FIXED between runs (anti-gaming): the model cannot adjust
// raw scores to a map that has not been re-fitted.

/** The calibrated green-lane threshold once N >= 10 runs of calibration data exist. */
export const GREEN_THRESHOLD = 0.95
/** The conservative cold-start green threshold (D6: "0.97 raw -> 0.95 calibrated"), applied while N < 10. */
export const COLD_START_GREEN_THRESHOLD = 0.97
/** D6: calibration needs N >= 10 production runs before the isotonic fit is trusted. */
export const MIN_CALIBRATION_RUNS = 10

export interface CalibrationPair {
  /** C_final (or C_raw at fit time) in [0,1]. */
  score: number
  correct: boolean
}

/** A fitted monotone step function, or the cold-start identity (`fitted: false`). */
export interface CalibrationModel {
  fitted: boolean
  /** PAV blocks sorted ascending by `x` (the score at which the pooled mean `y` begins). */
  blocks: readonly { x: number; y: number }[]
}

export function coldStartModel(): CalibrationModel {
  return { fitted: false, blocks: [] }
}

/**
 * The PAV isotonic fit core — pooled-adjacent-violators over {score, correct} pairs, no run-count guard.
 * Private: every public entry (`fitCalibration`, `refitCalibration`) must front it with the N >= 10 guard,
 * so a fitted map can NEVER be produced from fewer than MIN_CALIBRATION_RUNS distinct runs.
 */
function fitPav(pairs: readonly CalibrationPair[]): CalibrationModel {
  if (pairs.length === 0) return coldStartModel()
  const sorted = [...pairs].sort((a, b) => a.score - b.score)
  // PAV: accumulate pooled blocks, merging while the previous block's mean exceeds the next's.
  const pooled: { sum: number; count: number; x: number }[] = []
  for (const p of sorted) {
    pooled.push({ sum: p.correct ? 1 : 0, count: 1, x: p.score })
    while (
      pooled.length >= 2 &&
      pooled[pooled.length - 2]!.sum / pooled[pooled.length - 2]!.count >
        pooled[pooled.length - 1]!.sum / pooled[pooled.length - 1]!.count
    ) {
      const b = pooled.pop()!
      const a = pooled.pop()!
      pooled.push({ sum: a.sum + b.sum, count: a.count + b.count, x: a.x })
    }
  }
  return {
    fitted: true,
    blocks: pooled.map((b) => ({ x: b.x, y: b.sum / b.count })),
  }
}

/**
 * Fit the calibration map by Pool Adjacent Violators isotonic regression over {score, correct} pairs.
 * Returns the cold-start identity model until `runCount` reaches MIN_CALIBRATION_RUNS.
 *
 * NOTE the caller-supplied-`runCount` weakness ([G1-F1/F5]): a caller could pass any count. This entry is
 * retained for the D6 reference fixtures + the gate tests only. The M3 REFIT path uses `refitCalibration`,
 * which derives the run count from the ingested logs INSIDE the machinery (never a parameter).
 */
export function fitCalibration(
  pairs: readonly CalibrationPair[],
  runCount: number,
): CalibrationModel {
  if (runCount < MIN_CALIBRATION_RUNS) return coldStartModel()
  return fitPav(pairs)
}

// ─── M3 calibration REFIT machinery (WP-I) ──────────────────────────────────────────────────────────
//
// The refit ingests production RUN LOGS and re-fits the PAV map that replaces the cold-start identity.
// [G1-F5] The label of each log is a HUMAN REVIEW OUTCOME, never a model-verbalized belief. The input type
// makes that structural: an entry carries a `HumanReviewOutcome` ENUM, not a bare `correct: boolean`, so a
// model-belief boolean cannot be passed as the label. [G1-F1/F5] The distinct-run count is derived from the
// logs INSIDE the machinery (counting distinct `runId`s), never trusted from a caller-supplied number — this
// wraps `fitCalibration`'s caller-supplied-`runCount` weakness. Below MIN_CALIBRATION_RUNS distinct runs the
// refit returns the cold-start identity model (no fit). The fitted model reuses the SAME `CalibrationModel`
// shape + `applyCalibration` consumption path, so it plugs into `scoreProposal` unchanged.
//
// LIVE PATH IS UNTOUCHED. In v1 the live write gate (`apps/api/.../evidence-gate.ts`) stays pinned to
// `scoreProposalColdStart` (identity map). This machinery PRODUCES a fitted model but does NOT wire it into
// the gate — the actual fit-on-real-runs + wiring is a deploy-gated M3 step, out of v1 scope.

/**
 * The outcome of a HUMAN reviewing a Brain proposal after the run. This is the ONLY label the refit accepts.
 * It is deliberately an enum of human verdicts (not a boolean, and not a model-verbalized "I think this is
 * correct"): only `booked_correct` — a human confirmed the booking stands — counts as a positive outcome for
 * the PAV fit. `human_corrected` / `human_rejected` are negatives. A model belief has no representation here.
 */
export type HumanReviewOutcome =
  | "booked_correct" // a human reviewed and the booking stands (positive)
  | "human_corrected" // a human changed the booking (negative)
  | "human_rejected" // a human rejected the proposal outright (negative)

/**
 * One production run-log entry consumed by the refit. `runId` lets the machinery derive the distinct-run
 * count itself; `score` is the C_final the gate reported for the proposal; `outcome` is the HUMAN verdict.
 * There is deliberately NO `correct: boolean` field — a model-belief label has no way in.
 */
export interface RunLogEntry {
  /** The run this proposal belonged to. Distinct `runId`s drive the internal run-count guard. */
  runId: string
  /** The C_final the gate reported for this proposal, in [0,1] — the x-axis of the PAV fit. */
  score: number
  /** The HUMAN review verdict — the y-label. Only `booked_correct` is a positive. */
  outcome: HumanReviewOutcome
}

/** A human-outcome label is positive iff a human confirmed the booking stands. */
function isPositiveOutcome(outcome: HumanReviewOutcome): boolean {
  return outcome === "booked_correct"
}

/**
 * DEGENERATE-FIT GUARD (#569, W3.2/W3.3b). A fit is DEGENERATE when its inputs cannot support a
 * trustworthy monotone map, so any departure from identity is pure EXTRAPOLATION — and an extrapolating
 * map can RAISE a score, the confident-wrong cardinal sin. This complements (does not replace) the two
 * existing floors: the N >= MIN_CALIBRATION_RUNS run-count guard (a fit needs enough distinct runs) and
 * the post-calibration hard-class ceiling in `scoreProposal` (a fitted map can never lift a fired HARD
 * class). Those cover run-count and the 5 hard classes; this rejects the remaining degenerate shapes,
 * including the NON-hard-class caps the ceiling leaves calibration-liftable. Three cases, each FAILS
 * CLOSED to the cold-start identity model (never a mapping that lifts a score):
 *
 *   (a) ZERO-VARIANCE predictor — fewer than 2 distinct `score` values. The fit has seen no spread in the
 *       predictor, so it cannot know how correctness varies with score; its "map" is a constant that
 *       extrapolates to every unseen score.
 *   (b) SINGLE-BLOCK collapse — the PAV fit pools down to one block, i.e. a flat constant map, which
 *       raises every score below the constant. ("too-few-distinct-bins to fit a monotone map".)
 *   (c) ALL-SAME-LABEL — every outcome correct (the map lifts to ~1.0 everywhere) or every outcome wrong
 *       (collapses to 0.0): an uninformative / extrapolating fit; the all-correct arm raises every score
 *       below 1.0. This catches the multi-distinct-score all-correct case that (a)/(b) miss (PAV yields
 *       several blocks all at y=1.0, so it is neither zero-variance nor single-block, yet still degenerate).
 *
 * Any one ⇒ refuse the fit. This is strictly HOLD-ADDING: a rejected fit becomes the identity model, which
 * only ever LOWERS the effective calibrated ceiling (identity + the stricter 0.97 cold-start green threshold
 * vs a fitted map + 0.95) and never lifts a score.
 */
function isDegenerateFit(
  pairs: readonly CalibrationPair[],
  fit: CalibrationModel,
): boolean {
  // (a) zero-variance predictor: all scores identical (or empty).
  const distinctScores = new Set(pairs.map((p) => p.score))
  if (distinctScores.size < 2) return true
  // (b) single-block / too-few-distinct-bins: the PAV map is a flat constant.
  if (fit.blocks.length < 2) return true
  // (c) all-same-label: every outcome correct, or every outcome wrong.
  const firstLabel = pairs[0]?.correct
  if (pairs.every((p) => p.correct === firstLabel)) return true
  return false
}

/**
 * Re-fit the calibration map from production run logs (M3). Derives the distinct-run count from the logs
 * themselves ([G1-F1/F5], never a caller-supplied number); returns the cold-start identity model until at
 * least MIN_CALIBRATION_RUNS DISTINCT runs are present. Otherwise fits the monotone PAV map over
 * {score, human-outcome} pairs, then REJECTS a degenerate fit ([#569] `isDegenerateFit`), failing closed to
 * the cold-start identity so a zero-variance / single-block / all-same-label fit can never raise a score.
 * The result is a `CalibrationModel` consumed unchanged by `applyCalibration` / `scoreProposal`. It is
 * server-held + fixed between runs (never client-supplied) and, in v1, is NOT wired into the live gate.
 */
export function refitCalibration(
  logs: readonly RunLogEntry[],
): CalibrationModel {
  const distinctRuns = new Set<string>()
  for (const log of logs) distinctRuns.add(log.runId)
  if (distinctRuns.size < MIN_CALIBRATION_RUNS) return coldStartModel()
  const pairs: CalibrationPair[] = logs.map((log) => ({
    score: log.score,
    correct: isPositiveOutcome(log.outcome),
  }))
  const fit = fitPav(pairs)
  // [#569] Degenerate fits fail closed to the cold-start identity — never a map that could raise a score.
  if (isDegenerateFit(pairs, fit)) return coldStartModel()
  return fit
}

/** Apply the calibration map to a raw score. Cold-start (unfitted) => identity. */
export function applyCalibration(
  cRaw: number,
  model: CalibrationModel,
): number {
  if (!model.fitted || model.blocks.length === 0) return cRaw
  // Monotone step lookup: the pooled mean of the last block whose x <= cRaw (clamped to the ends).
  let y = model.blocks[0]!.y
  for (const block of model.blocks) {
    if (block.x <= cRaw) y = block.y
    else break
  }
  return y
}

/** The active green threshold for a model (calibrated 0.95, or cold-start 0.97). */
export function greenThreshold(model: CalibrationModel): number {
  return model.fitted ? GREEN_THRESHOLD : COLD_START_GREEN_THRESHOLD
}

/** Whether a calibrated score reaches the green (fast-approve) lane under the active threshold. */
export function isGreen(cFinal: number, model: CalibrationModel): boolean {
  return cFinal >= greenThreshold(model)
}

/** Brier score over {score, correct} pairs (D6: BS = mean (score - correct)^2; target <= 0.04). */
export function brierScore(pairs: readonly CalibrationPair[]): number {
  if (pairs.length === 0) return 0
  let sum = 0
  for (const p of pairs) {
    const diff = p.score - (p.correct ? 1 : 0)
    sum += diff * diff
  }
  return sum / pairs.length
}
