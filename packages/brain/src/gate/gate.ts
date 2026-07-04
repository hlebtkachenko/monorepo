// WP N-3 — the server-side confidence-gate SERVICE (a PURE decision function).
//
// Under the v1 reframe the Brain is an unprivileged CLIENT; the accounting write endpoint (#395)
// must score every proposed booking SERVER-side so the client cannot forge a green. This module is
// that scoring seam. It is a THIN, HONEST composition of the EXISTING confidence engine (score.ts +
// calibration.ts + signals.ts) — it introduces no new thresholds, caps, or confidence math. The HTTP
// wiring lands at #395; this WP builds only the pure function it will call.
//
// Cardinal-sin guard (brain/CLAUDE.md): confident-wrong (`confidence ≥ green` yet wrong). The decision
// gates on the INFRASTRUCTURE signals in `inputs`, NEVER on model-verbalized confidence. The model can
// never self-assert green: green is a pure function of `computeCRaw(inputs)` + the fixed calibration map,
// and a blocked or sub-green proposal ALWAYS routes to a human (`needsReview`).

import {
  applyCalibration,
  type CalibrationModel,
  coldStartModel,
  greenThreshold,
  isGreen,
} from "../confidence/calibration"
import { HARD_CLASSES } from "../confidence/hard-class"
import { computeCRaw, type ScoreInputs } from "../confidence/score"
import { isBlockSignal, TIER2_CAP_VALUES, tierOf } from "../confidence/signals"

/** The 5 hard-class kinds as a set, for the O(1) firedSignals intersection in the ceiling. */
const HARD_CLASS_SET: ReadonlySet<string> = new Set<string>(HARD_CLASSES)

/**
 * WP-CONF-CEIL — the POST-calibration hard-class ceiling ([G1-F1] / [G2-Opus arithmetic]).
 *
 * `minHardCap = min(TIER2_CAP_VALUES[k])` over `k ∈ intersect(inputs.firedSignals, HARD_CLASSES)`.
 * We derive the intersection from `inputs.firedSignals` (data the gate already holds) ∩ `HARD_CLASSES`.
 * We deliberately do NOT call `firedHardClassSignals` — that resolver re-runs the firing predicate against
 * facts the gate does not hold, so it would (wrongly) treat an absent amount/DUZP as unresolved. The gate
 * only clamps classes the caller ALREADY decided to fire.
 *
 * An EMPTY intersection ⇒ `minHardCap = 1.0` (no clamp). Every hard class is a `TIER2_CAP_VALUES` key
 * ([G3-R4]), so a fired hard class always resolves to a numeric cap.
 *
 * [G2-R2] The ceiling covers the 5 HARD_CLASSES ONLY. Other Tier-2 caps
 * (`vat_mismatch` / `reverse_charge_candidate` / `novel_bank_pattern` / ...) stay calibration-liftable BY
 * DESIGN — a fitted map may raise their capped C_raw above green on real outcome evidence. Those are held on
 * the LIVE path by the independent WP-D veto (`deriveCaptureVeto`/`derivePostingVeto`), NOT by this ceiling.
 * Never widen this to the non-hard-class caps: that would double-gate the veto's job and pin caps the fit is
 * meant to override.
 */
function minHardCap(firedSignals: readonly string[]): number {
  let cap = 1
  for (const kind of firedSignals) {
    if (HARD_CLASS_SET.has(kind)) {
      const value = (TIER2_CAP_VALUES as Record<string, number>)[kind]!
      if (value < cap) cap = value
    }
  }
  return cap
}

/** The server-side decision a write endpoint acts on. Purely a function of `inputs` (+ the fixed model). */
export interface GateDecision {
  /** C_raw from the D6 composition (0.0 if a Tier-1/Tier-3 block fired). */
  cRaw: number
  /**
   * C_final after the calibration map (identity at cold start), then clamped to the hard-class ceiling
   * (`min` with the lowest fired-hard-class Tier-2 cap); forced to 0.0 when `blocked`.
   */
  cFinal: number
  /** Reaches the green (fast-approve) lane under the model's active threshold. */
  isGreen: boolean
  /** A blocked or sub-green proposal always routes to a human. */
  needsReview: boolean
  /** A Tier-1 block or Tier-3 defer signal fired (C forced to 0.0). */
  blocked: boolean
  /** The infra-signal kinds that fired (echoed from `inputs.firedSignals`). */
  firedSignals: readonly string[]
  /** Short machine-usable list explaining the decision (see `deriveReasons`). */
  reasons: string[]
}

/**
 * Explain the decision from the fired infra signals + the outcome. Every reason is derived from
 * `inputs.firedSignals` via `isBlockSignal`/`tierOf`/`TIER2_CAP_VALUES` (or the outcome) — this invents
 * NO new confidence math, it only names the caps/blocks the engine already applied.
 */
function deriveReasons(
  firedSignals: readonly string[],
  cFinal: number,
  green: boolean,
  blocked: boolean,
  threshold: number,
): string[] {
  const reasons: string[] = []

  // Tier-1 block / Tier-3 defer signals — the C -> 0.0 forcers. Named first: they dominate the outcome.
  for (const kind of firedSignals) {
    if (isBlockSignal(kind)) reasons.push(`blocked: ${kind}`)
  }

  // Tier-2 review caps — name each cap that fired and the value it capped C at.
  for (const kind of firedSignals) {
    if (tierOf(kind) === 2 && kind in TIER2_CAP_VALUES) {
      const cap = (TIER2_CAP_VALUES as Record<string, number>)[kind]
      reasons.push(`capped by ${kind} at ${cap}`)
    }
  }

  if (green) {
    reasons.push("green")
  } else if (!blocked) {
    // Sub-green but not force-blocked: name the threshold it fell under.
    reasons.push(`below green threshold ${threshold}`)
  }

  return reasons
}

/**
 * Score a proposed booking server-side. PURE: identical `inputs` + `model` always yield an identical
 * decision. The model never self-asserts green — green is derived from the infra signals in `inputs`.
 */
export function scoreProposal(
  inputs: ScoreInputs,
  model: CalibrationModel,
): GateDecision {
  const { cRaw, blocked } = computeCRaw(inputs)
  // A block forces C to 0.0 unconditionally — never let a fitted calibration map lift a blocked
  // proposal's cRaw=0 into a non-zero cFinal / a green (it stays needsReview via `blocked`, but the
  // reported cFinal/isGreen must stay honest for any downstream that keys on them).
  //
  // Non-blocked path: apply the calibration map, THEN clamp to the hard-class ceiling POST-calibration
  // (WP-CONF-CEIL, [G1-F1] / [G2-Opus]). A cRaw-side clamp would be a vacuous no-op — score.ts:105 already
  // does `min(cCaps, composite)`, so cRaw is bounded below the cap before calibration; only a POST-calibration
  // clamp survives a fitted map that would lift a judgment-heavy fired hard class above green. The block
  // short-circuit is UNCHANGED and dominates the ceiling: a blocked signal still forces cFinal=0.
  const cFinal = blocked
    ? 0
    : Math.min(applyCalibration(cRaw, model), minHardCap(inputs.firedSignals))
  const green = isGreen(cFinal, model)
  // A blocked or sub-green proposal always routes to a human.
  const needsReview = !green || blocked
  const reasons = deriveReasons(
    inputs.firedSignals,
    cFinal,
    green,
    blocked,
    greenThreshold(model),
  )
  return {
    cRaw,
    cFinal,
    isGreen: green,
    needsReview,
    blocked,
    firedSignals: [...inputs.firedSignals],
    reasons,
  }
}

/**
 * Convenience: score against the cold-start model (identity map, 0.97 green threshold) — the default
 * before any calibration is fitted (N < 10 production runs).
 */
export function scoreProposalColdStart(inputs: ScoreInputs): GateDecision {
  return scoreProposal(inputs, coldStartModel())
}
