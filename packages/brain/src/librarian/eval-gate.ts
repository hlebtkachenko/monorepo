// Eval gate — the independent, threshold-checked verdict on whether a distilled candidate is
// strong enough to surface as a reviewable artifact. Reuses the SAME threshold machinery already
// committed for eval-as-CI (`../eval/metric`'s `checkThreshold`/`ThresholdSpec`) against the
// `booking_rule_pr_gate` bound already locked in `scripts/brain-build/eval-thresholds.lock`
// (0.90, "min", surface: ".brain/rules PR eval gate"). This module does not read that file at
// runtime (same convention as `eval/metric.ts`'s own hardcoded default threshold) — the constant
// below is drift-guarded by `eval-gate.test.ts` reading the lock file directly and asserting
// equality, so any future change to the locked bound without updating this constant fails CI.

import type { CorrectionCluster } from "./cluster"
import { decisionKey, normalizeDecisionForVote } from "./decision"
import type { CandidateRule } from "./distill"
import { checkThreshold, type ThresholdSpec } from "../eval/metric"

/** Mirrors `eval-thresholds.lock`'s `booking_rule_pr_gate` (bound 0.90, dir "min"). Drift-guarded
 * against the lock file in `eval-gate.test.ts` — never change one without the other. */
export const BOOKING_RULE_PR_GATE_THRESHOLD: ThresholdSpec = {
  bound: 0.9,
  dir: "min",
}

export interface CandidateEvalResult {
  /** Fraction of the cluster's DECIDED (non-rejected) corrections whose TREATMENT-NORMALIZED
   * decision matches the candidate's `proposedDecision`. */
  agreementRate: number
  matchedCount: number
  decidedCount: number
  threshold: ThresholdSpec
  /** `true` only when `agreementRate` clears `threshold` — the ONLY gate that may let a candidate
   * proceed to artifact emission. */
  pass: boolean
}

/**
 * Score a candidate against its own source cluster: what fraction of the cluster's decided
 * corrections agree with the candidate's proposed treatment, and does that rate clear the
 * `booking_rule_pr_gate` bound? A cluster with a strong-but-imperfect majority (distilled by
 * `distillCandidate`) can still fail here — distill proposes, this gates.
 *
 * The threshold is HARDCODED to `BOOKING_RULE_PR_GATE_THRESHOLD` — deliberately NOT a parameter.
 * The lock file's doctrine is "never loosen a bound to make a red gate pass"; an overridable
 * threshold sitting next to the drift-guarded constant would be exactly the loosening seam that
 * doctrine forbids, so the gate can only ever use the one drift-guarded value.
 *
 * Comparison is over the TREATMENT-NORMALIZED decision (`normalizeDecisionForVote`), matching how
 * `distillCandidate` votes — so per-document amount/date/id differences never split otherwise-equal
 * treatments.
 *
 * Honest scope note: with a single cluster as both the distillation source AND the scoring
 * population, this is a same-population consistency check, not a held-out generalization test — it
 * reuses the `booking_rule_pr_gate` NUMBER, which is weaker than that bound's stated held-out
 * brain-eval-suite surface. That is the correct measure for "is there a real majority in what's
 * been seen so far", and a true held-out eval against `.brain/evals/cases/**` golden fixtures is a
 * documented follow-up (see the librarian README) once real fixtures exist for the learned-rule
 * surface (`.brain/evals/` is empty at M0/M2, per its README).
 */
export function evaluateCandidate(
  candidate: CandidateRule,
  cluster: CorrectionCluster,
): CandidateEvalResult {
  const threshold = BOOKING_RULE_PR_GATE_THRESHOLD
  const decided = cluster.corrections.filter(
    (correction) => correction.decision !== null,
  )
  const candidateKey = decisionKey(
    normalizeDecisionForVote(candidate.proposedDecision),
  )
  const matched = decided.filter(
    (correction) =>
      decisionKey(normalizeDecisionForVote(correction.decision!)) ===
      candidateKey,
  ).length
  const decidedCount = decided.length
  const agreementRate = decidedCount === 0 ? 0 : matched / decidedCount
  return {
    agreementRate,
    matchedCount: matched,
    decidedCount,
    threshold,
    pass: decidedCount > 0 && checkThreshold(agreementRate, threshold),
  }
}
