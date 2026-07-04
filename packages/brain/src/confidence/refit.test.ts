import { describe, expect, expectTypeOf, it } from "vitest"

import {
  applyCalibration,
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

/** A run log of `count` entries, all at `score`, spread across `runs` distinct runId's, all booked-correct. */
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
    const model = refitCalibration(correctLogs(20, 0.9, MIN_CALIBRATION_RUNS))
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

  it("a POISONED all-correct-at-low-score set lifts the map, but the WP-C ceiling still keeps a fired hard class sub-green", () => {
    // The poisoning: every outcome at the asset_vs_expense cap (0.6) is booked-correct, so PAV lifts
    // score 0.6 to ~1.0. Fed through scoreProposal WITH a fired hard class, the fitted map WOULD green it,
    // but the post-calibration hard-class ceiling (WP-C) clamps cFinal back to the 0.6 cap.
    const cap = TIER2_CAP_VALUES.asset_vs_expense
    const poisoned = correctLogs(60, cap, MIN_CALIBRATION_RUNS)
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
    // One poisoned refit whose map sends 0.55 (the lowest hard-class cap) to ~1.0 lifts EVERY hard-class
    // cap (all <= 0.7) above green; the ceiling must hold each one.
    const model = refitCalibration(correctLogs(60, 0.55, MIN_CALIBRATION_RUNS))
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
    // Two runs' worth of entries at score 0.9: half booked_correct, half human_corrected => ~0.5 correct-rate.
    // If human_corrected were (wrongly) treated as a positive, the map would read ~1.0 here.
    const logs: RunLogEntry[] = []
    let n = 0
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
