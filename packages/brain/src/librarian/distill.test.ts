import { describe, expect, it } from "vitest"

import { clusterCorrections } from "./cluster"
import { ingestCorrections, type RawCorrectionRow } from "./correction"
import { candidateId, distillCandidate } from "./distill"

const signatureFields = {
  counterpartyKey: "CZ12345678",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
} as const

function approvedRow(
  id: string,
  account: string,
  edited = false,
): RawCorrectionRow {
  return {
    id,
    conversationId: null,
    toolName: "createAccountingEvent",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: { ...signatureFields, account: "999" }, // Brain's (wrong) proposal, when edited
    outputJson: edited
      ? {
          resolution: "approved",
          edit: {
            postingLines: [
              { accountId: account, side: "DEBIT", amount: "100.00" },
            ],
          },
        }
      : { resolution: "approved" },
  }
}

function rejectedRow(id: string): RawCorrectionRow {
  return {
    id,
    conversationId: null,
    toolName: "createAccountingEvent",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: { ...signatureFields, account: "999" },
    outputJson: { resolution: "rejected", note: "wrong entirely" },
  }
}

describe("distillCandidate", () => {
  it("refuses (returns null) below the minimum cluster size", () => {
    const records = ingestCorrections([
      approvedRow("a", "504", true),
      approvedRow("b", "504", true),
    ])
    const [cluster] = clusterCorrections(records)
    expect(distillCandidate(cluster!, 3)).toBeNull()
  })

  it("refuses when every correction in the cluster is a bare reject (no positive signal)", () => {
    const records = ingestCorrections([
      rejectedRow("a"),
      rejectedRow("b"),
      rejectedRow("c"),
    ])
    const [cluster] = clusterCorrections(records)
    expect(distillCandidate(cluster!, 3)).toBeNull()
  })

  it("distills the majority decision from a cluster with a clear majority", () => {
    const records = ingestCorrections([
      approvedRow("a", "504", true),
      approvedRow("b", "504", true),
      approvedRow("c", "504", true),
      approvedRow("d", "518", true), // minority, disagreeing correction
    ])
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    expect(candidate).not.toBeNull()
    expect(candidate!.supportCount).toBe(3)
    expect(candidate!.clusterSize).toBe(4)
    expect(candidate!.sourceCorrectionIds).toEqual(["a", "b", "c", "d"])
    expect(candidate!.proposedDecision.postingLines).toEqual([
      { accountId: "504", side: "DEBIT", amount: "100.00" },
    ])
    expect(candidate!.id).toBe(candidateId(cluster!.signature))
  })

  it("a reject counts toward clusterSize but never toward the winning decision", () => {
    const records = ingestCorrections([
      approvedRow("a", "504", true),
      approvedRow("b", "504", true),
      rejectedRow("c"),
    ])
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    expect(candidate).not.toBeNull()
    expect(candidate!.clusterSize).toBe(3)
    expect(candidate!.supportCount).toBe(2)
  })
})
