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
 * Fit the calibration map by Pool Adjacent Violators isotonic regression over {score, correct} pairs.
 * Returns the cold-start identity model until `runCount` reaches MIN_CALIBRATION_RUNS.
 */
export function fitCalibration(
  pairs: readonly CalibrationPair[],
  runCount: number,
): CalibrationModel {
  if (runCount < MIN_CALIBRATION_RUNS || pairs.length === 0)
    return coldStartModel()
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
