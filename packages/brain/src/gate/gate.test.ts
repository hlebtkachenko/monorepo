import { describe, expect, it } from "vitest"

import {
  applyCalibration,
  COLD_START_GREEN_THRESHOLD,
  coldStartModel,
  fitCalibration,
} from "../confidence/calibration"
import { firedHardClassSignals } from "../confidence/hard-class"
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
