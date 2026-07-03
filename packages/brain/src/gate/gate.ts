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
import { computeCRaw, type ScoreInputs } from "../confidence/score"
import { isBlockSignal, TIER2_CAP_VALUES, tierOf } from "../confidence/signals"

/** The server-side decision a write endpoint acts on. Purely a function of `inputs` (+ the fixed model). */
export interface GateDecision {
  /** C_raw from the D6 composition (0.0 if a Tier-1/Tier-3 block fired). */
  cRaw: number
  /** C_final after the calibration map (identity at cold start); forced to 0.0 when `blocked`. */
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
  const cFinal = blocked ? 0 : applyCalibration(cRaw, model)
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
