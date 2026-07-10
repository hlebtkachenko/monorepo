// End-to-end fixture test: ingest → cluster → distill → eval → emit, wired exactly as a real
// caller would use them. Demonstrates the two outcomes the M2.2 task calls out explicitly:
//  (1) a well-supported cluster produces the RIGHT candidate and a reviewable artifact.
//  (2) a poorly-supported cluster is distilled but REJECTED by the eval gate — no artifact.
// This is fixture-driven (DATA-GATED per the M2.2 brief): no real correction ever flows through
// this pipeline here — only hand-built fixtures standing in for real tool_call_log rows.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { clusterCorrections } from "./cluster"
import { ingestCorrections, type RawCorrectionRow } from "./correction"
import { distillCandidate } from "./distill"
import { evaluateCandidate } from "./eval-gate"
import { buildProposalArtifact, writeProposalArtifact } from "./emit"

const signature = {
  counterpartyKey: "CZ87654321",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
} as const

function fixtureRow(
  id: string,
  correctAccount: string,
  resolution: "approved" | "rejected" = "approved",
): RawCorrectionRow {
  return {
    id,
    conversationId: `conv-${id}`,
    toolName: "createAccountingEvent",
    createdAt: "2026-07-01T00:00:00.000Z",
    // The Brain always proposes the SAME (wrong) account "999" — every one of these fixtures is a
    // human correcting the same recurring mistake.
    inputJson: { ...signature, account: "999", amount: "500.00" },
    outputJson:
      resolution === "rejected"
        ? { resolution: "rejected", note: "not this supply kind at all" }
        : {
            resolution: "approved",
            edit: {
              postingLines: [
                { accountId: correctAccount, side: "DEBIT", amount: "500.00" },
              ],
            },
          },
  }
}

let tmpDirs: string[] = []
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-librarian-pipeline-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs = []
})

describe("librarian pipeline (ingest → cluster → distill → eval → emit)", () => {
  it("produces the right candidate + a written artifact from a well-supported fixture cluster", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => fixtureRow(`good-${i}`, "518")),
      fixtureRow("outlier", "504"), // one reviewer corrected it differently — 9/10 = 0.90, exactly clears the bound
    ]
    const records = ingestCorrections(rows)
    expect(records).toHaveLength(10)

    const [cluster] = clusterCorrections(records)
    expect(cluster!.signature).toEqual(signature)

    const candidate = distillCandidate(cluster!)
    expect(candidate).not.toBeNull()
    expect(candidate!.proposedDecision.postingLines).toEqual([
      { accountId: "518", side: "DEBIT", amount: "500.00" },
    ])

    const evalResult = evaluateCandidate(candidate!, cluster!)
    expect(evalResult.pass).toBe(true)

    const artifact = buildProposalArtifact(candidate!, evalResult)
    expect(artifact).not.toBeNull()
    expect(artifact!.status).toBe("proposed")

    const dir = makeTmpDir()
    const filePath = writeProposalArtifact(artifact!, dir)
    expect(existsSync(filePath)).toBe(true)
    const onDisk = JSON.parse(readFileSync(filePath, "utf8"))
    expect(onDisk.proposedDecision.postingLines[0].accountId).toBe("518")
    expect(onDisk.status).toBe("proposed")
  })

  it("rejects a poorly-supported cluster at the eval gate — no artifact, nothing written", () => {
    const rows = [
      fixtureRow("a", "518"),
      fixtureRow("b", "518"),
      fixtureRow("c", "504"), // only 2/3 agree — 0.667 < 0.90
    ]
    const records = ingestCorrections(rows)
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!)
    expect(candidate).not.toBeNull() // distill still proposes best-effort...

    const evalResult = evaluateCandidate(candidate!, cluster!)
    expect(evalResult.pass).toBe(false) // ...but the gate rejects it

    const artifact = buildProposalArtifact(candidate!, evalResult)
    expect(artifact).toBeNull() // ...so nothing is ever emitted
  })

  it("a cluster of nothing but rejects never reaches distillation (no positive signal to learn)", () => {
    const rows = [
      fixtureRow("a", "518", "rejected"),
      fixtureRow("b", "518", "rejected"),
      fixtureRow("c", "518", "rejected"),
    ]
    const records = ingestCorrections(rows)
    const [cluster] = clusterCorrections(records)
    expect(distillCandidate(cluster!)).toBeNull()
  })
})
