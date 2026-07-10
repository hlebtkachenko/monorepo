// Emit — the ONLY place in this pipeline that touches the filesystem, and the ONLY place a
// candidate rule can become a reviewable artifact. Hard safety properties, both enforced in code
// (not just by convention):
//
//   1. `buildProposalArtifact` returns `null` for any candidate whose eval result did not PASS —
//      a rejected candidate can never be turned into an artifact, let alone written anywhere.
//   2. `writeProposalArtifact` takes its output directory as a REQUIRED argument with no default.
//      There is no path in this module that reaches `packages/brain/.brain/rules/` (the live,
//      landed-rule tree) or any other repo path on its own — every write target is supplied by the
//      caller. Nothing in this PR calls `writeProposalArtifact` against a real directory; wiring a
//      real invocation (a CLI command, a scheduled job) is explicit future follow-up.
//
// The artifact itself is inert data (`status: "proposed"`) — plain JSON a human reads. Promoting a
// proposal into a real `.brain/rules/*.md` entry (and opening the GitHub PR ADR-0027 describes,
// `workflow_dispatch`) is a SEPARATE, human-initiated step this module does not perform.

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { CandidateEvalResult } from "./eval-gate"
import type { CandidateRule } from "./distill"

export interface ProposalArtifact {
  status: "proposed"
  generatedBy: "librarian"
  generatedAt: string
  candidateId: string
  signature: CandidateRule["signature"]
  proposedDecision: Record<string, unknown>
  support: {
    clusterSize: number
    supportCount: number
    decidedCount: number
    agreementRate: number
    sourceCorrectionIds: string[]
  }
  evalGate: {
    thresholdBound: number
    thresholdDir: "min" | "max" | "eq"
    value: number
    pass: true
  }
  reviewNote: string
}

const REVIEW_NOTE =
  "PROPOSAL ONLY — not applied anywhere. This file was distilled from human corrections of Brain " +
  "bookings sharing one signature (counterparty/direction/supply_kind/jurisdiction). It is not a " +
  "live rule and the librarian never wrote it into .brain/rules/ or any prod path. A human must " +
  "review it and, if it looks right, promote it into a real .brain/rules/*.md entry through a " +
  "normal reviewed PR (or the ADR-0027 workflow_dispatch automation, once built)."

/**
 * Build the reviewable artifact for a candidate, or `null` when the eval didn't pass. This is the
 * single choke point that makes "never emit a bad candidate" a type-level guarantee: there is no
 * code path from a failing `CandidateEvalResult` to a non-null `ProposalArtifact`.
 */
export function buildProposalArtifact(
  candidate: CandidateRule,
  evalResult: CandidateEvalResult,
): ProposalArtifact | null {
  if (!evalResult.pass) return null
  return {
    status: "proposed",
    generatedBy: "librarian",
    generatedAt: new Date().toISOString(),
    candidateId: candidate.id,
    signature: candidate.signature,
    proposedDecision: candidate.proposedDecision,
    support: {
      clusterSize: candidate.clusterSize,
      supportCount: candidate.supportCount,
      decidedCount: evalResult.decidedCount,
      agreementRate: evalResult.agreementRate,
      sourceCorrectionIds: candidate.sourceCorrectionIds,
    },
    evalGate: {
      thresholdBound: evalResult.threshold.bound,
      thresholdDir: evalResult.threshold.dir,
      value: evalResult.agreementRate,
      pass: true,
    },
    reviewNote: REVIEW_NOTE,
  }
}

/** Convenience: distills straight from a cluster + its eval result would be a caller
 * responsibility; this file name helper just fixes the on-disk naming convention. */
export function proposalArtifactFilename(artifact: ProposalArtifact): string {
  return `${artifact.candidateId}.json`
}

/**
 * Write an artifact as a plain JSON file under `dir`. `dir` is REQUIRED — there is no default, so
 * this function cannot silently write into a real repo path just by being called with fewer
 * arguments. Returns the written file's path.
 */
export function writeProposalArtifact(
  artifact: ProposalArtifact,
  dir: string,
): string {
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, proposalArtifactFilename(artifact))
  writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
  return filePath
}
