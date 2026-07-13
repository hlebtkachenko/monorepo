import { afterEach, describe, expect, it } from "vitest"

import {
  applyCalibration,
  type CalibrationPair,
  fitCalibration,
} from "@workspace/brain/confidence"
import { scoreProposal } from "@workspace/brain/gate"

import {
  buildScoreInputs,
  evaluateEvidence,
  resetCalibrationModelForTest,
  setCalibrationModel,
} from "./evidence-gate"

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

describe("evidence gate — server-derived novel_template signal [WS-2]", () => {
  it("threads a SERVER-derived novel_template into firedSignals (never from the client envelope)", () => {
    // A client can only assert Tier-2 caps via capSignals; novel_template is a
    // Tier-3 DEFER, so a client-asserted one is DROPPED — only the server's second
    // argument threads it in.
    const clientAsserted = buildScoreInputs({ capSignals: ["novel_template"] })
    expect(clientAsserted.firedSignals).not.toContain("novel_template")

    const serverInjected = buildScoreInputs(undefined, ["novel_template"])
    expect(serverInjected.firedSignals).toContain("novel_template")
  })

  it("novel_template stays sub-green under a FITTED calibration model (Tier-3 forces cRaw=0)", () => {
    // Even isolating from the always-on extraction_failed block, a fired
    // novel_template is itself a Tier-3 DEFER: cRaw=0, blocked, and a fitted map
    // that would lift a 0 above green cannot release it.
    const inputs = buildScoreInputs(undefined, ["novel_template"])
    expect(inputs.firedSignals).toContain("novel_template")
    const model = fittedMapping(0, 0.99)
    expect(applyCalibration(0, model)).toBeGreaterThan(0.95)
    const d = scoreProposal(inputs, model)
    expect(d.blocked).toBe(true)
    expect(d.cFinal).toBe(0)
    expect(d.isGreen).toBe(false)
  })

  it("evaluateEvidence with a server-derived novel_template is held (needsReview)", () => {
    const d = evaluateEvidence(undefined, ["novel_template"])
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
    expect(d.firedSignals).toContain("novel_template")
  })
})

describe("evaluateEvidence — [M3.2] consults the live calibration model, cold-start stays HELD", () => {
  afterEach(() => {
    // Never let a test's setCalibrationModel leak into a sibling test.
    resetCalibrationModelForTest()
  })

  it("evaluateEvidence is byte-identical to the cold-start default (no model set yet)", () => {
    // Load-bearing: wiring `evaluateEvidence` to consult `liveCalibrationModel`
    // must be a no-op until a human explicitly calls `setCalibrationModel` —
    // nothing in this codebase does, so this must still equal the pre-M3.2
    // scoreProposalColdStart output.
    const d = evaluateEvidence(undefined)
    expect(d.blocked).toBe(true)
    expect(d.cRaw).toBe(0)
    expect(d.cFinal).toBe(0)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("[LOAD-BEARING] cold-start floor stays HELD even once a FITTED model is set live", () => {
    // A fitted (N>=10) model whose history says score 0 was always correct maps
    // 0 -> ~1.0 (see gate.test.ts's "a block stays honest under a fitted model").
    const pairs: CalibrationPair[] = Array.from({ length: 12 }, () => ({
      score: 0,
      correct: true,
    }))
    const model = fitCalibration(pairs, 12)
    expect(model.fitted).toBe(true)
    expect(applyCalibration(0, model)).toBeGreaterThan(0.95) // the map WOULD lift a 0...

    setCalibrationModel(model)

    // ...but every write is STILL held: the structural extraction_failed block
    // forces `blocked=true` in computeCRaw regardless of the model, which forces
    // cFinal=0 in scoreProposal regardless of the model. Consulting a live model
    // changes NOTHING while the floor is up.
    const noEnvelope = evaluateEvidence(undefined)
    expect(noEnvelope.blocked).toBe(true)
    expect(noEnvelope.cFinal).toBe(0)
    expect(noEnvelope.isGreen).toBe(false)
    expect(noEnvelope.needsReview).toBe(true)

    // Even a maxed client-claimed envelope (every base-score + verify bonus at
    // its best value) cannot green a write under the live fitted model.
    const maxedClaim = evaluateEvidence({
      kbRule: "constitution_safe",
      extractionQuality: 1,
      reconciliation: "full",
      vatBaseMatchesNet: true,
      rcChecklistPassesOrNA: true,
      decree500Confirmed: true,
      periodConsistent: true,
      bankVsKsSsMatch: true,
    })
    expect(maxedClaim.isGreen).toBe(false)
    expect(maxedClaim.blocked).toBe(true)
    expect(maxedClaim.cFinal).toBe(0)

    // A server-derived novel_template also stays sub-green under the live model.
    const serverDerived = evaluateEvidence(undefined, ["novel_template"])
    expect(serverDerived.isGreen).toBe(false)
    expect(serverDerived.blocked).toBe(true)
  })

  it("resetCalibrationModelForTest restores the safe cold-start default", () => {
    const pairs: CalibrationPair[] = Array.from({ length: 12 }, () => ({
      score: 0,
      correct: true,
    }))
    setCalibrationModel(fitCalibration(pairs, 12))
    resetCalibrationModelForTest()
    // Still held (as always), and provably back on the cold-start identity map:
    // applyCalibration would be a no-op, so a below-cold-start-threshold score
    // stays exactly itself rather than the fitted map's lift.
    const d = evaluateEvidence(undefined)
    expect(d.cFinal).toBe(d.cRaw)
  })
})
