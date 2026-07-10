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
    // proposedDecision is the TREATMENT-normalized rule — account + side only, the per-document
    // `amount` stripped (a booking rule is not a payload clone).
    expect(candidate!.proposedDecision.postingLines).toEqual([
      { accountId: "504", side: "DEBIT" },
    ])
    expect(candidate!.proposedDecision).not.toHaveProperty("amount")
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

  it("corrections that differ ONLY in per-document amount converge on ONE treatment", () => {
    // Same supplier, same supply, same corrected account "504" + side — but every invoice a
    // different amount. Before normalization these would be 3 distinct decisions (support 1 each)
    // and never converge; after normalization they are ONE rule with full support.
    function editedAmount(id: string, amount: string): RawCorrectionRow {
      return {
        id,
        conversationId: null,
        toolName: "createAccountingEvent",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: { ...signatureFields, account: "999", amount },
        outputJson: {
          resolution: "approved",
          edit: { postingLines: [{ accountId: "504", side: "DEBIT", amount }] },
        },
      }
    }
    const records = ingestCorrections([
      editedAmount("a", "1200.00"),
      editedAmount("b", "3499.90"),
      editedAmount("c", "58.00"),
    ])
    const [cluster] = clusterCorrections(records)
    const candidate = distillCandidate(cluster!, 3)
    expect(candidate).not.toBeNull()
    // Full support: all three converge despite three different amounts.
    expect(candidate!.supportCount).toBe(3)
    expect(candidate!.clusterSize).toBe(3)
    expect(candidate!.proposedDecision.postingLines).toEqual([
      { accountId: "504", side: "DEBIT" },
    ])
  })
})
