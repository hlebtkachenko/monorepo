import { describe, expect, expectTypeOf, it } from "vitest"

import {
  applyCalibration,
  type CalibrationModel,
  type HumanReviewOutcome,
  MIN_CALIBRATION_RUNS,
  refitCalibration,
  type RunLogEntry,
} from "./calibration"
import { firedHardClassSignals, HARD_CLASSES } from "./hard-class"
import type { ScoreInputs } from "./score"
import { TIER2_CAP_VALUES } from "./signals"
import { scoreProposal } from "../gate/gate"

// WP-I — the M3 calibration REFIT machinery. It ingests production RUN LOGS whose label is a HUMAN review
// outcome (never a model belief), derives the distinct-run count INSIDE the machinery, and fits the monotone
// PAV map only once >= MIN_CALIBRATION_RUNS distinct runs exist. These tests pin: the internal run-count
// guard, a valid monotone fit, the poisoned-fit-can't-green invariant (the WP-C ceiling holds), and the
// human-outcome-only label contract.

/**
 * A run log of `count` entries, all at ONE `score`, spread across `runs` distinct runId's, all
 * booked-correct. NOTE: this is a DEGENERATE input (zero-variance predictor + all-same-label + single
 * block) — used for the run-count-guard tests (where the result is cold-start anyway) and, post-#569, as
 * the canonical degenerate fixture the degenerate-fit guard must reject.
 */
const correctLogs = (
  count: number,
  score: number,
  runs: number,
): RunLogEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    runId: `run-${i % runs}`,
    score,
    outcome: "booked_correct" as const,
  }))

/**
 * A NON-degenerate run log spread across `runs` distinct runId's: two distinct score bins with MIXED
 * outcomes, so the PAV fit is a genuine ≥2-block monotone map that SURVIVES the #569 degenerate-fit guard.
 * Use wherever a test needs an actual fitted model.
 */
const variedLogs = (runs: number): RunLogEntry[] => {
  const out: RunLogEntry[] = []
  let n = 0
  for (const [score, rate] of [
    [0.4, 0.3],
    [0.8, 0.7],
  ] as const) {
    const total = 20
    const correct = Math.round(rate * total)
    for (let i = 0; i < total; i++) {
      out.push({
        runId: `run-${n % runs}`,
        score,
        outcome: i < correct ? "booked_correct" : "human_corrected",
      })
      n++
    }
  }
  return out
}

/**
 * A NON-degenerate "poisoned" run log across `runs` distinct runId's: a LOW-score bin with MIXED outcomes
 * (keeping the fit multi-score, multi-label, multi-block so it survives the #569 guard) plus a bin at
 * `liftFrom` that is entirely booked-correct — a genuine monotone PAV fit that still LIFTS every score
 * at/above `liftFrom` to ~1.0. This is the realistic poison the WP-C ceiling must clamp.
 */
const poisonedLogs = (liftFrom: number, runs: number): RunLogEntry[] => {
  const out: RunLogEntry[] = []
  let n = 0
  for (let i = 0; i < 20; i++) {
    out.push({
      runId: `run-${n % runs}`,
      score: 0.1,
      outcome: i % 2 === 0 ? "booked_correct" : "human_corrected",
    })
    n++
  }
  for (let i = 0; i < 40; i++) {
    out.push({
      runId: `run-${n % runs}`,
      score: liftFrom,
      outcome: "booked_correct",
    })
    n++
  }
  return out
}

describe("refitCalibration — internal run-count guard [G1-F1/F5]", () => {
  it("derives the distinct-run count from the logs (not a caller param) and returns cold-start below the floor", () => {
    // 30 log entries but only 9 DISTINCT runs — a caller-supplied count of 30 would (wrongly) pass the
    // fitCalibration guard, but refit counts distinct runId's itself and stays cold-start.
    const logs = correctLogs(30, 0.6, MIN_CALIBRATION_RUNS - 1)
    const distinctRuns = new Set(logs.map((l) => l.runId)).size
    expect(distinctRuns).toBe(MIN_CALIBRATION_RUNS - 1)
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(false)
    expect(model.blocks).toEqual([])
    // Cold-start model = identity map.
    expect(applyCalibration(0.6, model)).toBe(0.6)
  })

  it("empty logs => cold-start", () => {
    const model = refitCalibration([])
    expect(model.fitted).toBe(false)
  })

  it("exactly MIN_CALIBRATION_RUNS distinct runs => fits", () => {
    // A NON-degenerate history at exactly the floor: the run-count guard passes AND the fit is trustworthy
    // (>=2 distinct scores, mixed labels), so it is not caught by the #569 degenerate-fit guard.
    const model = refitCalibration(variedLogs(MIN_CALIBRATION_RUNS))
    expect(model.fitted).toBe(true)
  })
})

describe("refitCalibration — normal fit (isotonic property)", () => {
  it("a well-calibrated set maps near-identity", () => {
    // At score s, roughly s of the outcomes are booked-correct — an already-calibrated history.
    const logs: RunLogEntry[] = []
    let n = 0
    for (const s of [0.2, 0.4, 0.6, 0.8]) {
      const total = 50
      const correct = Math.round(s * total)
      for (let i = 0; i < total; i++) {
        logs.push({
          runId: `run-${n % MIN_CALIBRATION_RUNS}`,
          score: s,
          outcome: i < correct ? "booked_correct" : "human_corrected",
        })
        n++
      }
    }
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(true)
    for (const s of [0.2, 0.4, 0.6, 0.8]) {
      // Each score maps close to its own empirical correct-rate (which equals s here).
      expect(applyCalibration(s, model)).toBeCloseTo(s, 1)
    }
  })

  it("the fitted map is monotone non-decreasing in score (isotonic)", () => {
    // A mis-calibrated history the PAV should correct: low scores are actually MORE correct than high ones,
    // so PAV pools them into a single non-decreasing map.
    const logs: RunLogEntry[] = []
    let n = 0
    const buckets: [number, number][] = [
      [0.3, 0.9], // score 0.3 empirically 90% correct
      [0.6, 0.5], // score 0.6 empirically 50% correct
      [0.9, 0.95], // score 0.9 empirically 95% correct
    ]
    for (const [s, rate] of buckets) {
      const total = 40
      const correct = Math.round(rate * total)
      for (let i = 0; i < total; i++) {
        logs.push({
          runId: `run-${n % MIN_CALIBRATION_RUNS}`,
          score: s,
          outcome: i < correct ? "booked_correct" : "human_rejected",
        })
        n++
      }
    }
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(true)
    // Isotonic: block y-values are non-decreasing in x.
    const blocks = model.blocks
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]!.y).toBeGreaterThanOrEqual(blocks[i - 1]!.y)
    }
    // Sampling the map across the score range is likewise non-decreasing.
    let prev = -Infinity
    for (const x of [0.1, 0.3, 0.5, 0.6, 0.7, 0.9, 1.0]) {
      const y = applyCalibration(x, model)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })
})

describe("refitCalibration — poisoned fit cannot green a fired hard class [G1-F1/F5]", () => {
  /** A maxed clean proposal carrying only the given fired signals (mirrors the gate tests). */
  const maxedInputs = (firedSignals: readonly string[]): ScoreInputs => ({
    firedSignals,
    kbRule: "constitution_safe",
    verify: {
      vatBaseMatchesNet: true,
      rcChecklistPassesOrNA: true,
      decree500Confirmed: true,
      periodConsistent: true,
      bankVsKsSsMatch: true,
    },
    extractionQuality: 1.0,
    reconciliation: "full",
  })

  it("a POISONED (but non-degenerate) fit lifts the map, but the WP-C ceiling still keeps a fired hard class sub-green", () => {
    // The poisoning: every outcome at the asset_vs_expense cap (0.6) is booked-correct, so PAV lifts
    // score 0.6 to ~1.0. The fit is deliberately NON-degenerate (a lower mixed bin survives the #569 guard),
    // so it really fits. Fed through scoreProposal WITH a fired hard class, the fitted map WOULD green it,
    // but the post-calibration hard-class ceiling (WP-C) clamps cFinal back to the 0.6 cap.
    const cap = TIER2_CAP_VALUES.asset_vs_expense
    const poisoned = poisonedLogs(cap, MIN_CALIBRATION_RUNS)
    const model = refitCalibration(poisoned)
    expect(model.fitted).toBe(true)
    // The poisoned map WOULD lift the capped score above the 0.95 fitted green threshold...
    expect(applyCalibration(cap, model)).toBeGreaterThan(0.95)

    const fired = firedHardClassSignals(["asset_vs_expense"], {}) // nothing resolves it
    expect(fired).toEqual(["asset_vs_expense"])
    const d = scoreProposal(maxedInputs(fired), model)
    // ...but the WP-C post-calibration ceiling clamps it back to the hard-class cap: still NOT green.
    expect(d.cRaw).toBe(cap)
    expect(d.cFinal).toBe(cap)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("every hard class stays sub-green under a poisoned refit that lifts all their caps above green", () => {
    // One poisoned (non-degenerate) refit whose map sends 0.55 (the lowest hard-class cap) to ~1.0 lifts
    // EVERY hard-class cap (all <= 0.7) above green; the ceiling must hold each one.
    const model = refitCalibration(poisonedLogs(0.55, MIN_CALIBRATION_RUNS))
    expect(model.fitted).toBe(true)
    for (const kind of HARD_CLASSES) {
      const cap = (TIER2_CAP_VALUES as Record<string, number>)[kind]!
      expect(applyCalibration(cap, model)).toBeGreaterThan(0.95)
      const d = scoreProposal(maxedInputs([kind]), model)
      expect(d.cFinal).toBe(cap)
      expect(d.isGreen).toBe(false)
    }
  })
})

describe("refitCalibration — human-outcome-only label contract [G1-F5]", () => {
  it("only booked_correct counts as a positive; corrected/rejected are negatives", () => {
    // A NON-degenerate two-bin history (so it survives the #569 guard): a low bin at 0.5 all human_corrected
    // (rate 0), plus a bin at 0.9 that is half booked_correct / half human_corrected. If human_corrected
    // were (wrongly) a positive, the 0.9 bin would read ~1.0; because it is a NEGATIVE, its empirical
    // correct-rate is ~0.5.
    const logs: RunLogEntry[] = []
    let n = 0
    for (let i = 0; i < 20; i++) {
      logs.push({
        runId: `run-${n % MIN_CALIBRATION_RUNS}`,
        score: 0.5,
        outcome: "human_corrected",
      })
      n++
    }
    for (let i = 0; i < 40; i++) {
      logs.push({
        runId: `run-${n % MIN_CALIBRATION_RUNS}`,
        score: 0.9,
        outcome: i % 2 === 0 ? "booked_correct" : "human_corrected",
      })
      n++
    }
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(true)
    expect(applyCalibration(0.9, model)).toBeCloseTo(0.5, 1)
  })

  it("the input label is a HUMAN-review enum, structurally distinct from a model-belief boolean", () => {
    // Type-level proof: RunLogEntry.outcome is the HumanReviewOutcome enum, NOT a boolean. A model-verbalized
    // `correct: boolean` cannot satisfy this field, so a model belief can never drive the fit.
    expectTypeOf<RunLogEntry["outcome"]>().toEqualTypeOf<HumanReviewOutcome>()
    expectTypeOf<RunLogEntry["outcome"]>().not.toEqualTypeOf<boolean>()
    // RunLogEntry has no `correct` boolean field at all — the belief label has no way in.
    expectTypeOf<RunLogEntry>().not.toHaveProperty("correct")
    // @ts-expect-error a bare model-belief boolean is not a valid RunLogEntry outcome.
    const _bad: RunLogEntry = { runId: "r", score: 0.9, outcome: true }
    void _bad
  })
})

describe("refitCalibration — degenerate-fit guard fails closed to identity (#569)", () => {
  it("(a) zero-variance predictor (all scores identical) => rejected, cold-start identity", () => {
    // 60 entries across 10 runs, ALL at score 0.8, mixed outcomes: the predictor never varies, so no
    // monotone map can be trusted. The N>=10 floor passes, so ONLY the degenerate guard can hold this.
    const logs: RunLogEntry[] = []
    let n = 0
    for (let i = 0; i < 60; i++) {
      logs.push({
        runId: `run-${n % MIN_CALIBRATION_RUNS}`,
        score: 0.8,
        outcome: i % 2 === 0 ? "booked_correct" : "human_corrected",
      })
      n++
    }
    expect(new Set(logs.map((l) => l.runId)).size).toBe(MIN_CALIBRATION_RUNS)
    expect(new Set(logs.map((l) => l.score)).size).toBe(1)
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(false)
    expect(model.blocks).toEqual([])
    expect(applyCalibration(0.8, model)).toBe(0.8) // identity: never raised
  })

  it("(b) single-block all-correct at one score => rejected, cannot lift to 1.0", () => {
    // Every outcome booked-correct at one score — the classic poison that maps everything to 1.0. The
    // zero-variance, single-block AND all-same-label arms all fire; the guard rejects.
    const model = refitCalibration(correctLogs(60, 0.7, MIN_CALIBRATION_RUNS))
    expect(model.fitted).toBe(false)
    expect(applyCalibration(0.7, model)).toBe(0.7) // NOT lifted to 1.0
    expect(applyCalibration(0.1, model)).toBe(0.1) // and never lifts a low score
  })

  it("(c) all-same-label across MULTIPLE distinct scores => rejected (multi-block but uninformative)", () => {
    // All booked-correct at 3 distinct scores → PAV yields 3 blocks all at y=1.0 (neither zero-variance
    // nor single-block), yet still uninformative and would lift every score to 1.0. The all-same-label arm
    // catches what the other two miss.
    const logs: RunLogEntry[] = []
    let n = 0
    for (const s of [0.3, 0.6, 0.9]) {
      for (let i = 0; i < 20; i++) {
        logs.push({
          runId: `run-${n % MIN_CALIBRATION_RUNS}`,
          score: s,
          outcome: "booked_correct",
        })
        n++
      }
    }
    expect(new Set(logs.map((l) => l.score)).size).toBe(3)
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(false)
    expect(applyCalibration(0.3, model)).toBe(0.3) // would have been lifted to 1.0 without the guard
  })

  it("all-wrong (every outcome a negative) => rejected, cold-start identity", () => {
    const logs: RunLogEntry[] = []
    let n = 0
    for (const s of [0.2, 0.5, 0.9]) {
      for (let i = 0; i < 20; i++) {
        logs.push({
          runId: `run-${n % MIN_CALIBRATION_RUNS}`,
          score: s,
          outcome: "human_rejected",
        })
        n++
      }
    }
    const model = refitCalibration(logs)
    expect(model.fitted).toBe(false)
    expect(applyCalibration(0.9, model)).toBe(0.9) // identity, not collapsed to 0
  })

  it("a legitimate non-degenerate fit is NOT rejected (guard is tightening-only)", () => {
    // Sanity: the guard does not touch a real multi-score, multi-label, multi-block fit.
    const model = refitCalibration(variedLogs(MIN_CALIBRATION_RUNS))
    expect(model.fitted).toBe(true)
    expect(model.blocks.length).toBeGreaterThanOrEqual(2)
  })
})

describe("refitCalibration — a degenerate fit cannot green a non-hard-class write it would identity-block (#569 regression)", () => {
  // The gap #569 closes: the WP-C ceiling clamps ONLY the 5 HARD_CLASSES. A NON-hard-class Tier-2 cap
  // (vat_mismatch, 0.8) is "calibration-liftable by design" — a fitted map lifting 0.8 above green is NOT
  // clamped by the ceiling. So the ONLY thing between a DEGENERATE all-correct-at-0.8 fit and a forged
  // green here is the degenerate-fit guard.
  const maxedInputs = (firedSignals: readonly string[]): ScoreInputs => ({
    firedSignals,
    kbRule: "constitution_safe",
    verify: {
      vatBaseMatchesNet: true,
      rcChecklistPassesOrNA: true,
      decree500Confirmed: true,
      periodConsistent: true,
      bankVsKsSsMatch: true,
    },
    extractionQuality: 1.0,
    reconciliation: "full",
  })

  it("guarded refit stays cold-start identity => the vat_mismatch write stays sub-green + needsReview", () => {
    expect(HARD_CLASSES).not.toContain("vat_mismatch")
    const inputs = maxedInputs(["vat_mismatch"]) // non-hard-class Tier-2 cap 0.8
    // The exact degenerate history that WOULD lift 0.8 -> 1.0.
    const degenerate = correctLogs(
      60,
      TIER2_CAP_VALUES.vat_mismatch,
      MIN_CALIBRATION_RUNS,
    )
    const guarded = refitCalibration(degenerate)
    expect(guarded.fitted).toBe(false) // guard rejected the degenerate fit
    const d = scoreProposal(inputs, guarded)
    expect(d.cRaw).toBe(TIER2_CAP_VALUES.vat_mismatch)
    expect(d.cFinal).toBe(TIER2_CAP_VALUES.vat_mismatch) // identity map: no lift
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("COUNTERFACTUAL: the same lifting map, if applied unguarded, WOULD forge a green (ceiling does not cover it)", () => {
    const inputs = maxedInputs(["vat_mismatch"])
    // A hand-built poisoned model equivalent to the rejected degenerate fit: it lifts 0.8 -> 1.0.
    const poisonedModel: CalibrationModel = {
      fitted: true,
      blocks: [{ x: TIER2_CAP_VALUES.vat_mismatch, y: 1.0 }],
    }
    expect(applyCalibration(TIER2_CAP_VALUES.vat_mismatch, poisonedModel)).toBe(
      1,
    )
    const d = scoreProposal(inputs, poisonedModel)
    expect(d.cFinal).toBe(1) // NOT clamped — vat_mismatch is not a hard class
    expect(d.isGreen).toBe(true) // the forged green the #569 guard prevents
  })
})
