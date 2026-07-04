import { describe, expect, it } from "vitest"

import {
  applyCalibration,
  type CalibrationPair,
  fitCalibration,
} from "@workspace/brain/confidence"
import { scoreProposal } from "@workspace/brain/gate"

import { buildScoreInputs, evaluateEvidence } from "./evidence-gate"

/**
 * [WP-D] Fail-closed evidence gate. These pin the load-bearing safety property:
 * the server score is UNREACHABLE-green at cold start no matter what the client
 * self-reports, so nothing auto-applies until real calibration + server-verifiable
 * evidence exist. The independent veto (accounting-veto.test.ts) is AND-composed
 * on top; the three-way AND is exercised in accounting-writes.gate.test.ts.
 */

/** A fitted (N>=10) PAV model mapping `atScore` to `toValue` (see gate.test.ts). */
const fittedMapping = (atScore: number, toValue: number) => {
  const total = 100
  const correctCount = Math.round(toValue * total)
  const pairs: CalibrationPair[] = Array.from({ length: total }, (_, i) => ({
    score: atScore,
    correct: i < correctCount,
  }))
  return fitCalibration(pairs, total)
}

describe("evaluateEvidence — fail-closed cold start [G1-F3]/[G3-R1]", () => {
  it("HOLDS with NO evidence envelope (green unreachable)", () => {
    const d = evaluateEvidence(undefined)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
    expect(d.blocked).toBe(true) // structural extraction_failed forces cRaw=0
    expect(d.cFinal).toBe(0)
  })

  it("HOLDS even with a MAXED client-claimed envelope (claims never consumed directly)", () => {
    // A client asserting every base-score + verify bonus at its best value cannot
    // green the write — the server degrades all of them fail-closed.
    const d = evaluateEvidence({
      kbRule: "constitution_safe",
      extractionQuality: 1,
      reconciliation: "full",
      vatBaseMatchesNet: true,
      rcChecklistPassesOrNA: true,
      decree500Confirmed: true,
      periodConsistent: true,
      bankVsKsSsMatch: true,
    })
    expect(d.isGreen).toBe(false)
    expect(d.blocked).toBe(true)
    expect(d.cFinal).toBe(0)
  })

  it("degrades every base-score / verify field to its worst value", () => {
    const inputs = buildScoreInputs({
      kbRule: "constitution_safe",
      extractionQuality: 1,
      reconciliation: "full",
      vatBaseMatchesNet: true,
      bankVsKsSsMatch: true,
    })
    expect(inputs.kbRule).toBe("none")
    expect(inputs.extractionQuality).toBe(0)
    expect(inputs.reconciliation).toBe("none")
    expect(inputs.verify).toEqual({})
    expect(inputs.firedSignals).toContain("extraction_failed")
  })
})

describe("evaluateEvidence — cap signals honored fail-safe [G2-Opus]", () => {
  it("threads a recognized Tier-2 cap kind (only ever LOWERS trust)", () => {
    const inputs = buildScoreInputs({ capSignals: ["novel_ico"] })
    expect(inputs.firedSignals).toContain("novel_ico")
    // Still held (extraction_failed dominates); the cap never releases a write.
    expect(evaluateEvidence({ capSignals: ["novel_ico"] }).isGreen).toBe(false)
  })

  it("drops an UNKNOWN cap kind (a typo must not look load-bearing)", () => {
    const inputs = buildScoreInputs({ capSignals: ["not_a_real_signal"] })
    expect(inputs.firedSignals).not.toContain("not_a_real_signal")
  })
})

describe("evaluateEvidence — post-fit guard [WP-A-gate]", () => {
  it("stays sub-green under a FITTED map that would lift the degraded cRaw to ~0.96", () => {
    // The degraded inputs carry the structural extraction_failed block ⇒ cRaw=0.
    const inputs = buildScoreInputs(undefined)
    // A fitted calibration that says score 0 was empirically ~96% correct would
    // lift a 0 → ~0.96 (above the 0.95 fitted green threshold)...
    const model = fittedMapping(0, 0.96)
    expect(model.fitted).toBe(true)
    expect(applyCalibration(0, model)).toBeGreaterThan(0.95)
    // ...but the block short-circuit forces cFinal=0, so green stays unreachable.
    const d = scoreProposal(inputs, model)
    expect(d.blocked).toBe(true)
    expect(d.cFinal).toBe(0)
    expect(d.isGreen).toBe(false)
  })

  it("a fitted map cannot green even a cap-carrying degraded envelope", () => {
    const inputs = buildScoreInputs({ capSignals: ["novel_ico"] })
    const model = fittedMapping(0, 0.99)
    const d = scoreProposal(inputs, model)
    expect(d.isGreen).toBe(false)
  })
})
