import { describe, expect, it } from "vitest"

import { clusterCorrections } from "./cluster"
import { ingestCorrections, type RawCorrectionRow } from "./correction"
import { distillCandidate } from "./distill"
import {
  LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN,
  evaluateCandidate,
} from "./eval-gate"

const signatureFields = {
  counterpartyKey: "CZ12345678",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
} as const

// A `createAccountingPosting` (kind "double") whose reviewer edit corrects the posting-line account,
// replayed through the SAME per-tool merge that would book it.
function approvedRow(id: string, account: string): RawCorrectionRow {
  return {
    id,
    conversationId: null,
    toolName: "createAccountingPosting",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: {
      ...signatureFields,
      kind: "double",
      entry: {
        lines: [{ accountId: "999", side: "DEBIT", amount: "100.00" }],
      },
    },
    outputJson: {
      resolution: "approved",
      edit: {
        postingLines: [{ accountId: account, side: "DEBIT", amount: "100.00" }],
      },
    },
  }
}

describe("LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN", () => {
  it("is a 0.90 'min' floor and is the threshold evaluateCandidate stamps onto its result", () => {
    // It is an IN-SAMPLE consistency floor, independent of the locked held-out booking_rule_pr_gate
    // bound — deliberately its own named constant so an in-sample number can never read as the
    // held-out promotion gate (that gate is wired in M2.3).
    expect(LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN).toEqual({
      bound: 0.9,
      dir: "min",
    })

    const records = ingestCorrections([
      approvedRow("a", "504"),
      approvedRow("b", "504"),
      approvedRow("c", "504"),
    ])
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    const result = evaluateCandidate(candidate!, cluster!)
    expect(result.threshold).toBe(LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN)
  })
})

describe("evaluateCandidate", () => {
  it("REJECTS a candidate whose cluster agreement falls below the 0.90 floor", () => {
    // 4 corrections, only 3 agree with the majority (75% < 90%).
    const records = ingestCorrections([
      approvedRow("a", "504"),
      approvedRow("b", "504"),
      approvedRow("c", "504"),
      approvedRow("d", "518"),
    ])
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    const result = evaluateCandidate(candidate!, cluster!)
    expect(result.agreementRate).toBeCloseTo(0.75)
    expect(result.pass).toBe(false)
  })

  it("PASSES a candidate whose cluster agreement clears the 0.90 floor", () => {
    // 10 corrections, 9 agree with the majority (90% === floor, "min" direction passes on equality).
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => approvedRow(`agree-${i}`, "504")),
      approvedRow("disagree", "518"),
    ]
    const records = ingestCorrections(rows)
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    const result = evaluateCandidate(candidate!, cluster!)
    expect(result.agreementRate).toBeCloseTo(0.9)
    expect(result.pass).toBe(true)
  })

  it("never passes an empty/all-rejected population (no decided corrections)", () => {
    const records = ingestCorrections([
      {
        id: "a",
        conversationId: null,
        toolName: "createAccountingPosting",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: signatureFields,
        outputJson: { resolution: "rejected" },
      },
      {
        id: "b",
        conversationId: null,
        toolName: "createAccountingPosting",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: signatureFields,
        outputJson: { resolution: "rejected" },
      },
      {
        id: "c",
        conversationId: null,
        toolName: "createAccountingPosting",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: signatureFields,
        outputJson: { resolution: "rejected" },
      },
    ])
    const [cluster] = clusterCorrections(records)
    // distillCandidate already refuses this cluster (null); evaluateCandidate must also never pass
    // an empty decided population if it were ever called directly on one.
    expect(distillCandidate(cluster!, 3)).toBeNull()
  })
})
