import { describe, expect, it } from "vitest"

import {
  applyCalibration,
  COLD_START_GREEN_THRESHOLD,
  coldStartModel,
  fitCalibration,
} from "../confidence/calibration"
import { firedHardClassSignals, HARD_CLASSES } from "../confidence/hard-class"
import type { ScoreInputs } from "../confidence/score"
import { TIER2_CAP_VALUES } from "../confidence/signals"
import { scoreProposal, scoreProposalColdStart } from "./gate"

// The gate is the SERVER-side scoring seam a write endpoint calls. These tests pin the four load-bearing
// outcomes (clean green, Tier-1 block, fired hard-class cap, purity) so the client can never forge a green.

/** A maxed clean proposal — every verifier check passed, structured extraction, full reconciliation. */
const maxedInputs = (firedSignals: readonly string[]): ScoreInputs => ({
  firedSignals,
  kbRule: "constitution_safe", // 0.95 base
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

describe("scoreProposal — green lane", () => {
  it("a maxed clean proposal (no signals) is green and needs no review", () => {
    const d = scoreProposalColdStart(maxedInputs([]))
    expect(d.blocked).toBe(false)
    expect(d.cRaw).toBeGreaterThanOrEqual(COLD_START_GREEN_THRESHOLD)
    expect(d.cFinal).toBe(d.cRaw) // cold-start identity map
    expect(d.isGreen).toBe(true)
    expect(d.needsReview).toBe(false)
    expect(d.reasons).toContain("green")
  })
})

describe("scoreProposal — Tier-1 block", () => {
  it("no_source_doc blocks: cFinal reflects 0, needsReview, not green", () => {
    const d = scoreProposalColdStart(maxedInputs(["no_source_doc"]))
    expect(d.blocked).toBe(true)
    expect(d.cRaw).toBe(0)
    expect(d.cFinal).toBe(0) // cold-start identity: calibration of 0 is 0
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
    expect(d.reasons).toContain("blocked: no_source_doc")
  })
})

describe("scoreProposal — fired hard-class cap", () => {
  it("asset_vs_expense (unresolved) caps sub-green and needs review", () => {
    const fired = firedHardClassSignals(["asset_vs_expense"], {}) // nothing resolves it
    expect(fired).toEqual(["asset_vs_expense"])
    const d = scoreProposalColdStart(maxedInputs(fired))
    expect(d.blocked).toBe(false)
    expect(d.cRaw).toBe(TIER2_CAP_VALUES.asset_vs_expense)
    expect(d.cFinal).toBeLessThan(COLD_START_GREEN_THRESHOLD)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
    expect(d.reasons).toContain(
      `capped by asset_vs_expense at ${TIER2_CAP_VALUES.asset_vs_expense}`,
    )
    expect(d.reasons).toContain(
      `below green threshold ${COLD_START_GREEN_THRESHOLD}`,
    )
  })
})

describe("scoreProposal — reasons correctness", () => {
  it("a green proposal reports 'green' and no cap/block reason", () => {
    const d = scoreProposalColdStart(maxedInputs([]))
    expect(d.reasons).toEqual(["green"])
  })

  it("names every fired Tier-2 cap and does not report green below threshold", () => {
    const d = scoreProposalColdStart(maxedInputs(["novel_ico", "vat_mismatch"]))
    expect(d.reasons).toContain(
      `capped by novel_ico at ${TIER2_CAP_VALUES.novel_ico}`,
    )
    expect(d.reasons).toContain(
      `capped by vat_mismatch at ${TIER2_CAP_VALUES.vat_mismatch}`,
    )
    expect(d.reasons).not.toContain("green")
    expect(d.reasons).toContain(
      `below green threshold ${COLD_START_GREEN_THRESHOLD}`,
    )
  })

  it("a blocked proposal reports the block, not a below-threshold reason", () => {
    const d = scoreProposalColdStart(maxedInputs(["closed_period"]))
    expect(d.reasons).toEqual(["blocked: closed_period"])
  })
})

describe("scoreProposal — a block stays honest under a fitted model", () => {
  it("blocked → cFinal 0 + not green, even when calibration would map cRaw=0 to high", () => {
    // A fitted (N>=10) model whose history says score 0 was always correct maps 0 -> ~1.0. Without the
    // block short-circuit, a blocked proposal (cRaw=0) would inherit that lift and report cFinal high /
    // isGreen true (still needsReview via `blocked`, but the reported values would be dishonest).
    const pairs = Array.from({ length: 12 }, () => ({
      score: 0,
      correct: true,
    }))
    const model = fitCalibration(pairs, 12)
    expect(model.fitted).toBe(true)
    expect(applyCalibration(0, model)).toBeGreaterThan(0) // the map WOULD lift a 0...
    const d = scoreProposal(maxedInputs(["no_source_doc"]), model)
    expect(d.blocked).toBe(true)
    expect(d.cFinal).toBe(0) // ...but the block forces it to 0
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })
})

// WP-CONF-CEIL — the POST-calibration hard-class ceiling. A fitted calibration can lift a capped C_raw above
// green on outcome history; the ceiling clamps cFinal back to the fired hard class's Tier-2 cap so a
// judgment-heavy hard class can NEVER auto-apply, no matter what the fit says.

/**
 * Build a FITTED calibration model whose map sends `atScore` to `toValue`. The PAV fit pools same-score
 * {score, correct} pairs into one block whose y = the correct-rate; `toValue = correctCount / total`.
 * e.g. 49 correct + 1 incorrect at score 0.6 => a block (x=0.6, y=0.98), so applyCalibration(0.6)=0.98.
 */
const fittedMapping = (atScore: number, toValue: number) => {
  const total = 100
  const correctCount = Math.round(toValue * total)
  const pairs = Array.from({ length: total }, (_, i) => ({
    score: atScore,
    correct: i < correctCount,
  }))
  return fitCalibration(pairs, total)
}

describe("scoreProposal — post-calibration hard-class ceiling (WP-CONF-CEIL)", () => {
  it("(a) a fitted map lifting 0.6->0.98 still keeps a fired hard class sub-green [G1-F1]", () => {
    // asset_vs_expense caps C_raw at 0.6. A fitted calibration says score 0.6 is empirically 98% correct.
    const model = fittedMapping(TIER2_CAP_VALUES.asset_vs_expense, 0.98)
    expect(model.fitted).toBe(true)
    // The map WOULD lift the capped C_raw above the 0.95 fitted green threshold...
    expect(
      applyCalibration(TIER2_CAP_VALUES.asset_vs_expense, model),
    ).toBeGreaterThan(0.95)

    const fired = firedHardClassSignals(["asset_vs_expense"], {}) // nothing resolves it
    expect(fired).toEqual(["asset_vs_expense"])
    const d = scoreProposal(maxedInputs(fired), model)
    // ...but the POST-calibration ceiling clamps cFinal back to the hard-class cap.
    expect(d.cRaw).toBe(TIER2_CAP_VALUES.asset_vs_expense)
    expect(d.cFinal).toBe(TIER2_CAP_VALUES.asset_vs_expense)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("(b) a NON-hard-class Tier-2 cap (vat_mismatch) is UNAFFECTED by the ceiling", () => {
    // vat_mismatch caps C_raw at 0.8 but is NOT a hard class — the ceiling must not touch it; only the
    // WP-D veto holds it on the live path. Its calibrated value passes straight through.
    expect(HARD_CLASSES).not.toContain("vat_mismatch")
    const model = fittedMapping(TIER2_CAP_VALUES.vat_mismatch, 0.98)
    const calibrated = applyCalibration(TIER2_CAP_VALUES.vat_mismatch, model)
    expect(calibrated).toBeGreaterThan(0.95)

    const d = scoreProposal(maxedInputs(["vat_mismatch"]), model)
    expect(d.cRaw).toBe(TIER2_CAP_VALUES.vat_mismatch)
    expect(d.cFinal).toBe(calibrated) // no clamp — the ceiling does not cover vat_mismatch
    expect(d.isGreen).toBe(true) // the fit lifts it green; only WP-D's veto holds it live
  })

  it("(c) an EMPTY hard-class intersection yields no clamp (cFinal === calibrated) [G3-R4]", () => {
    // No fired hard class => minHardCap = 1.0 => cFinal is exactly the calibrated value.
    const model = fittedMapping(0.9, 0.99)
    const inputs = maxedInputs([]) // clean, cRaw high; no hard class in firedSignals
    const d = scoreProposal(inputs, model)
    expect(d.cFinal).toBe(applyCalibration(d.cRaw, model))
    // Also holds when a non-hard-class cap fires (still empty hard-class intersection).
    const d2 = scoreProposal(maxedInputs(["novel_ico"]), model)
    expect(d2.cFinal).toBe(applyCalibration(d2.cRaw, model))
  })

  it("(d) a BLOCKED signal still forces cFinal=0 even with a fired hard class (no reorder)", () => {
    // A fitted map that would lift cRaw=0 high; a block MUST dominate the ceiling composition.
    const pairs = Array.from({ length: 12 }, () => ({
      score: 0,
      correct: true,
    }))
    const model = fitCalibration(pairs, 12)
    expect(applyCalibration(0, model)).toBeGreaterThan(0)
    // Both a Tier-1 block AND a hard class fire; the block short-circuit wins.
    const d = scoreProposal(
      maxedInputs(["no_source_doc", "asset_vs_expense"]),
      model,
    )
    expect(d.blocked).toBe(true)
    expect(d.cFinal).toBe(0)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("(e) [G2-R2] the ceiling is COUPLED to HARD_CLASSES only — a future veto refactor cannot silently reopen the vat/RC lift", () => {
    // Regression guard: every kind the ceiling clamps must be a hard class, and no non-hard-class Tier-2 cap
    // may be clamped by it. This pins the ceiling's scope so widening HARD_CLASSES (or a veto refactor that
    // reroutes vat_mismatch/reverse_charge_candidate through scoreProposal) can never lift them here.
    const model = fittedMapping(0.6, 0.99) // maps every hard-class cap (all <= 0.7) above green
    for (const kind of HARD_CLASSES) {
      const d = scoreProposal(maxedInputs([kind]), model)
      // Clamped to its own cap, sub-green — the ceiling holds it regardless of the fit.
      expect(d.cFinal).toBe((TIER2_CAP_VALUES as Record<string, number>)[kind])
      expect(d.isGreen).toBe(false)
    }
    // The non-hard-class caps the plan calls out as "calibration-liftable by design" are NOT clamped.
    for (const kind of [
      "vat_mismatch",
      "reverse_charge_candidate",
      "novel_bank_pattern",
    ] as const) {
      expect(HARD_CLASSES).not.toContain(kind)
      const capModel = fittedMapping(TIER2_CAP_VALUES[kind], 0.98)
      const d = scoreProposal(maxedInputs([kind]), capModel)
      expect(d.cFinal).toBe(applyCalibration(d.cRaw, capModel)) // passes through, not clamped
    }
  })
})

describe("scoreProposal — purity", () => {
  it("same inputs + model yield an identical decision", () => {
    const inputs = maxedInputs(["novel_ico"])
    const model = coldStartModel()
    const a = scoreProposal(inputs, model)
    const b = scoreProposal(inputs, model)
    expect(a).toEqual(b)
  })

  it("echoes firedSignals as a fresh array (no aliasing of the input)", () => {
    const firedSignals = ["novel_ico"]
    const d = scoreProposal(maxedInputs(firedSignals), coldStartModel())
    expect(d.firedSignals).toEqual(firedSignals)
    expect(d.firedSignals).not.toBe(firedSignals)
  })
})
