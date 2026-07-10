// Distill — turn a cluster of corrections into ONE candidate rule: the majority decision the
// cluster's resolved (non-rejected) corrections agree on. This stage is deliberately best-effort
// (majority vote, not unanimous consensus) — the `eval-gate` stage is the independent, threshold-
// gated check of whether that majority is strong enough to surface. Two stages, two jobs: distill
// PROPOSES, eval GATES.

import { createHash } from "node:crypto"

import type { CorrectionCluster } from "./cluster"
import { decisionKey, normalizeDecisionForVote } from "./decision"
import { signatureKey } from "./signature"

export interface CandidateRule {
  /** Deterministic id — hash of the signature AND the normalized proposed treatment. A byte-
   * identical re-distillation collides (idempotent regenerate-in-place, intended); a re-run that
   * DRIFTS the treatment for the same signature gets a distinct id, so its artifact lands beside the
   * superseded one instead of silently overwriting it. See `candidateId`. */
  id: string
  signature: CorrectionCluster["signature"]
  /** The majority decision — NOT auto-applied anywhere; a proposal only. */
  proposedDecision: Record<string, unknown>
  /** How many of the cluster's DECIDED (non-rejected) corrections agree with `proposedDecision`. */
  supportCount: number
  /** Total corrections in the cluster (decided + rejected). */
  clusterSize: number
  sourceCorrectionIds: string[]
  distilledAt: string
}

/** Default minimum evidence bar — refuse to distill anything from fewer than 3 corrections (a
 * single or double correction is noise, not a pattern). Deliberately conservative; callers may
 * pass a stricter bound. */
export const DEFAULT_MIN_CLUSTER_SIZE = 3

/**
 * Deterministic candidate id over BOTH the signature and the proposed treatment. Hashing the
 * signature alone made a drifted re-run for the same signature produce the same id, so
 * `writeProposalArtifact` would OVERWRITE the prior `<id>.json` and lose the superseded proposal.
 * Folding in the normalized decision (the same `normalizeDecisionForVote` form the votes/gate use)
 * gives a CHANGED proposal a distinct filename, while a byte-identical re-run still collides
 * (idempotent regenerate). A NUL separator keeps `signature || decision` unforgeable.
 */
export function candidateId(
  signature: CorrectionCluster["signature"],
  proposedDecision: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(signatureKey(signature))
    .update("\u0000")
    .update(decisionKey(normalizeDecisionForVote(proposedDecision)))
    .digest("hex")
    .slice(0, 16)
}

/**
 * Distill a candidate rule from a cluster, or `null` when there isn't enough evidence:
 *  - cluster smaller than `minClusterSize` → refuse (not enough evidence).
 *  - every correction in the cluster is a bare reject (no decision known) → refuse (no positive
 *    signal exists to propose FROM — I8: never fabricate a "corrected" decision no human stated).
 *
 * The vote is over the TREATMENT-NORMALIZED decision (`normalizeDecisionForVote` — per-document
 * amounts / dates / document ids stripped), so two corrections that differ only in invoice amount
 * converge on the same rule, and the returned `proposedDecision` is that normalized treatment (it
 * never embeds a fixed invoice amount). Ties break on the FIRST decision reached in cluster order
 * (deterministic, never random). Whether that majority is strong enough to surface is the next
 * stage's job (`evaluateCandidate`'s in-sample consistency floor, ≥0.90; the held-out promotion gate
 * is M2.3) — this function does not gate on agreement.
 */
export function distillCandidate(
  cluster: CorrectionCluster,
  minClusterSize: number = DEFAULT_MIN_CLUSTER_SIZE,
): CandidateRule | null {
  if (cluster.corrections.length < minClusterSize) return null

  const decided = cluster.corrections.filter(
    (
      correction,
    ): correction is typeof correction & {
      decision: Record<string, unknown>
    } => correction.decision !== null,
  )
  if (decided.length === 0) return null

  const votes = new Map<
    string,
    { decision: Record<string, unknown>; count: number }
  >()
  for (const correction of decided) {
    const treatment = normalizeDecisionForVote(correction.decision)
    const key = decisionKey(treatment)
    const existing = votes.get(key)
    if (existing) existing.count += 1
    else votes.set(key, { decision: treatment, count: 1 })
  }

  let winner: { decision: Record<string, unknown>; count: number } | null = null
  for (const entry of votes.values()) {
    if (winner === null || entry.count > winner.count) winner = entry
  }
  // `votes` is non-empty because `decided` is non-empty, so `winner` is always assigned here.
  const top = winner!

  return {
    id: candidateId(cluster.signature, top.decision),
    signature: cluster.signature,
    proposedDecision: top.decision,
    supportCount: top.count,
    clusterSize: cluster.corrections.length,
    sourceCorrectionIds: cluster.corrections.map((correction) => correction.id),
    distilledAt: new Date().toISOString(),
  }
}
