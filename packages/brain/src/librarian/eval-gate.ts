// Eval gate — an IN-SAMPLE consistency check on a distilled candidate, using the shared threshold
// machinery from eval-as-CI (`../eval/metric`'s `checkThreshold`/`ThresholdSpec`). It scores a
// candidate against the SAME cluster it was distilled from, so it answers only "is there a real
// majority in what's been seen so far", NOT "does this rule generalize".
//
// It therefore has its OWN threshold constant (`LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN`), deliberately
// NOT the locked `booking_rule_pr_gate` bound: that bound's stated surface
// (`scripts/brain-build/eval-thresholds.lock`, "min" 0.90, surface ".brain/rules PR eval gate") is a
// HELD-OUT brain-eval-suite measure. Borrowing its number for an in-sample check made an in-sample
// pass read as the held-out promotion gate — a masquerade. The in-sample floor happens to also be
// 0.90, but it is an independent knob (not sourced from, and not drift-guarded against, the lock).
//
// The TRUE held-out promotion gate — scoring a candidate against `.brain/evals/cases/**` golden
// fixtures it was NOT distilled from — is wired in M2.3, when both the eval harness and real labeled
// cases exist (`packages/brain/.brain/evals/` is a README with no cases today). Building it now is
// M2.3 work blocked on real labeled data; this module does not fake it.

import type { CorrectionCluster } from "./cluster"
import { decisionKey, normalizeDecisionForVote } from "./decision"
import type { CandidateRule } from "./distill"
import { checkThreshold, type ThresholdSpec } from "../eval/metric"

/**
 * In-sample consistency floor for the librarian's same-cluster agreement check. NOT the held-out
 * `booking_rule_pr_gate` promotion gate (that is M2.3 — see the module header). Independent by
 * design: an in-sample number must never be able to read as the held-out gate, so this is its own
 * named constant, not a mirror of the lock. If this value ever needs to move, it moves on its own
 * merits, not because the locked PR-gate bound moved.
 */
export const LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN: ThresholdSpec = {
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
  /** `true` only when `agreementRate` clears the in-sample consistency floor. This is an in-sample
   * gate on the current cluster, NOT the held-out promotion gate (M2.3) — see the module header. */
  pass: boolean
}

/**
 * Score a candidate against its own source cluster: what fraction of the cluster's decided
 * corrections agree with the candidate's proposed treatment, and does that rate clear the in-sample
 * consistency floor? A cluster with a strong-but-imperfect majority (distilled by `distillCandidate`)
 * can still fail here — distill proposes, this gates.
 *
 * This is an IN-SAMPLE consistency check: the single cluster is both the distillation source AND the
 * scoring population, so it measures "is there a real majority in what's been seen so far", NOT
 * "does this rule generalize to unseen cases". The true held-out promotion gate — scoring against
 * `.brain/evals/cases/**` golden fixtures the candidate was NOT distilled from — is wired in M2.3
 * once the eval harness + real labeled cases exist (see the module header + the librarian README).
 *
 * The threshold is HARDCODED to `LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN` — deliberately NOT a parameter,
 * so no caller can loosen the floor to make a red check pass.
 *
 * Comparison is over the TREATMENT-NORMALIZED decision (`normalizeDecisionForVote`), matching how
 * `distillCandidate` votes — so per-document amount/date/id differences never split otherwise-equal
 * treatments.
 */
export function evaluateCandidate(
  candidate: CandidateRule,
  cluster: CorrectionCluster,
): CandidateEvalResult {
  const threshold = LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN
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
