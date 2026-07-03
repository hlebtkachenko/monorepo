import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  applyCalibration,
  brierScore,
  type CalibrationPair,
  COLD_START_GREEN_THRESHOLD,
  coldStartModel,
  computeCRaw,
  fitCalibration,
  GREEN_THRESHOLD,
  greenThreshold,
  isGreen,
  type ScoreInputs,
  TIER2_CAP_VALUES,
  VERIFY_BONUS,
} from "./index"

// Pins the engine to the LOCKED D6 reference fixtures. A drift in the formula fails here; a tamper of
// the fixtures shows in git diff (committed under scripts/brain-build/). This is the anti-confident-wrong
// anchor for the calibration code (a subtly-wrong formula is a build-level confident-wrong).
const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "scripts/brain-build/calibration-fixtures.json",
)
const fx = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
  scoreFixtures: {
    name: string
    inputs: ScoreInputs
    expected: { cRaw: number; blocked: boolean; cCaps: number }
  }[]
  calibration: {
    coldStart: {
      greenThreshold: number
      applyIdentity: [number, number][]
      green: [number, boolean][]
    }
    belowMinRuns: {
      runCount: number
      pairs: [number, boolean][]
      expectFitted: boolean
    }
    fittedPAV: {
      runCount: number
      pairs: [number, boolean][]
      expectFitted: boolean
      blocks: { x: number; y: number }[]
      greenThreshold: number
      apply: [number, number][]
      green: [number, boolean][]
    }
  }
  brier: { pairs: [number, boolean][]; expected: number }[]
}

const toPairs = (raw: [number, boolean][]): CalibrationPair[] =>
  raw.map(([score, correct]) => ({ score, correct }))

describe("C_raw score composition (D6 reference fixtures)", () => {
  for (const f of fx.scoreFixtures) {
    it(f.name, () => {
      const r = computeCRaw(f.inputs)
      expect(r.cRaw).toBeCloseTo(f.expected.cRaw, 6)
      expect(r.blocked).toBe(f.expected.blocked)
      expect(r.cCaps).toBeCloseTo(f.expected.cCaps, 6)
    })
  }
})

describe("calibration map", () => {
  it("cold start: identity map + 0.97 green threshold", () => {
    const model = coldStartModel()
    expect(greenThreshold(model)).toBe(fx.calibration.coldStart.greenThreshold)
    for (const [x, y] of fx.calibration.coldStart.applyIdentity) {
      expect(applyCalibration(x, model)).toBeCloseTo(y, 6)
    }
    for (const [x, expected] of fx.calibration.coldStart.green) {
      expect(isGreen(applyCalibration(x, model), model)).toBe(expected)
    }
  })

  it("below MIN_CALIBRATION_RUNS stays cold-start (unfitted)", () => {
    const m = fitCalibration(
      toPairs(fx.calibration.belowMinRuns.pairs),
      fx.calibration.belowMinRuns.runCount,
    )
    expect(m.fitted).toBe(fx.calibration.belowMinRuns.expectFitted)
  })

  it("fitted PAV isotonic reproduces the pooled blocks + 0.95 threshold", () => {
    const p = fx.calibration.fittedPAV
    const model = fitCalibration(toPairs(p.pairs), p.runCount)
    expect(model.fitted).toBe(p.expectFitted)
    expect(model.blocks).toEqual(p.blocks)
    expect(greenThreshold(model)).toBe(p.greenThreshold)
    for (const [x, y] of p.apply) {
      expect(applyCalibration(x, model)).toBeCloseTo(y, 6)
    }
    for (const [x, expected] of p.green) {
      expect(isGreen(applyCalibration(x, model), model)).toBe(expected)
    }
  })
})

describe("Brier score", () => {
  for (const b of fx.brier) {
    it(`pairs=${b.pairs.length} -> ${b.expected}`, () => {
      expect(brierScore(toPairs(b.pairs))).toBeCloseTo(b.expected, 6)
    })
  }
})

describe("prior-book re-derivation hard-class caps (adversarial FM1)", () => {
  // The dangerous case: the KB rule confidently reproduces the prior accountant's classification on the
  // exact judgment class where the error lives (asset booked as expense). Everything else is maxed. The
  // hard-class cap must still force the item below green so it CANNOT auto-book — it routes to the human.
  const maxedButHardClass = (signal: string): ScoreInputs => ({
    firedSignals: [signal],
    kbRule: "high_active",
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

  const hardClasses = [
    "asset_vs_expense",
    "accrual_period_boundary",
    "reserve_or_impairment",
    "dph_tax_point_timing",
    "prior_without_source",
  ] as const

  for (const kind of hardClasses) {
    it(`${kind}: caps cRaw at ${TIER2_CAP_VALUES[kind]}, below both green thresholds`, () => {
      const { cRaw } = computeCRaw(maxedButHardClass(kind))
      expect(cRaw).toBe(TIER2_CAP_VALUES[kind])
      expect(cRaw).toBeLessThan(GREEN_THRESHOLD) // 0.95 — steady-state green unreachable
      expect(cRaw).toBeLessThan(COLD_START_GREEN_THRESHOLD) // 0.97 — cold-start green unreachable
    })
  }
})

describe("VERIFY_BONUS allowlist (control 2 — no prior-book agreement bonus)", () => {
  // The load-bearing form of the no-`priorBookAgrees` control: the additive verification bonuses are a
  // CLOSED allowlist of the five verifier checks. A prior-book AGREEMENT must never earn a positive bonus
  // (the adversarial-overruled confident-wrong vector) — a disagreement instead fires `multi_source_conflict`
  // (a cap, not a bonus). This pins that in the layer that owns the table, refactor-proof against any rename.
  it("keys are exactly the five verifier checks and none rewards prior-book agreement", () => {
    expect(Object.keys(VERIFY_BONUS).sort()).toEqual(
      [
        "bankVsKsSsMatch",
        "decree500Confirmed",
        "periodConsistent",
        "rcChecklistPassesOrNA",
        "vatBaseMatchesNet",
      ].sort(),
    )
    for (const key of Object.keys(VERIFY_BONUS)) {
      expect(key).not.toMatch(/prior|agree/i)
    }
  })
})
