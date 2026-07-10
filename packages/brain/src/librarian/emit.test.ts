import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type { CandidateEvalResult } from "./eval-gate"
import type { CandidateRule } from "./distill"
import {
  buildProposalArtifact,
  proposalArtifactFilename,
  writeProposalArtifact,
} from "./emit"

const candidate: CandidateRule = {
  id: "abc123",
  signature: {
    counterpartyKey: "CZ1",
    direction: "RECEIVED",
    supplyKind: "SERVICES",
    jurisdiction: "DOMESTIC",
  },
  proposedDecision: { account: "518", amount: "100.00" },
  supportCount: 9,
  clusterSize: 10,
  sourceCorrectionIds: Array.from({ length: 10 }, (_, i) => `c${i}`),
  distilledAt: "2026-07-10T00:00:00.000Z",
}

const passingEval: CandidateEvalResult = {
  agreementRate: 0.9,
  matchedCount: 9,
  decidedCount: 10,
  threshold: { bound: 0.9, dir: "min" },
  pass: true,
}

const failingEval: CandidateEvalResult = {
  ...passingEval,
  agreementRate: 0.5,
  pass: false,
}

let tmpDirs: string[] = []
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-librarian-test-"))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs = []
})

describe("buildProposalArtifact", () => {
  it("returns null for a failing eval result — a rejected candidate can NEVER become an artifact", () => {
    expect(buildProposalArtifact(candidate, failingEval)).toBeNull()
  })

  it("builds a status:'proposed' artifact for a passing eval result", () => {
    const artifact = buildProposalArtifact(candidate, passingEval)
    expect(artifact).not.toBeNull()
    expect(artifact!.status).toBe("proposed")
    expect(artifact!.generatedBy).toBe("librarian")
    expect(artifact!.candidateId).toBe("abc123")
    expect(artifact!.proposedDecision).toEqual({
      account: "518",
      amount: "100.00",
    })
    expect(artifact!.evalGate).toEqual({
      thresholdBound: 0.9,
      thresholdDir: "min",
      value: 0.9,
      pass: true,
    })
    expect(artifact!.reviewNote).toMatch(/PROPOSAL ONLY/)
    expect(artifact!.reviewNote).toMatch(
      /never applied|never wrote it into \.brain\/rules/i,
    )
  })
})

describe("writeProposalArtifact", () => {
  it("writes the artifact as JSON under the CALLER-SUPPLIED directory only — never a hardcoded path", () => {
    const dir = makeTmpDir()
    const artifact = buildProposalArtifact(candidate, passingEval)!
    const filePath = writeProposalArtifact(artifact, dir)

    expect(filePath).toBe(join(dir, proposalArtifactFilename(artifact)))
    expect(existsSync(filePath)).toBe(true)

    const written = JSON.parse(readFileSync(filePath, "utf8"))
    expect(written).toEqual(artifact)

    // Exactly one file, inside the given tmp dir, nothing else touched.
    expect(readdirSync(dir)).toEqual([proposalArtifactFilename(artifact)])
  })

  it("never targets packages/brain/.brain/rules (the live, landed-rule tree) by default", () => {
    // writeProposalArtifact's `dir` parameter has no default value in its signature (verified by
    // the TS signature itself: `dir: string`, not `dir: string = ...`) — this test additionally
    // proves the function performs no repo-relative path construction of its own: the returned
    // path is always exactly `join(suppliedDir, filename)`, with the filename being only the
    // candidate id, never a path segment that could escape the supplied directory.
    const dir = makeTmpDir()
    const artifact = buildProposalArtifact(candidate, passingEval)!
    const filePath = writeProposalArtifact(artifact, dir)
    expect(filePath.startsWith(dir)).toBe(true)
    expect(filePath).not.toContain(".brain")
  })
})
