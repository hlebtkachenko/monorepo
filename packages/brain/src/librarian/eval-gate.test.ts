import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { clusterCorrections } from "./cluster"
import { ingestCorrections, type RawCorrectionRow } from "./correction"
import { distillCandidate } from "./distill"
import { BOOKING_RULE_PR_GATE_THRESHOLD, evaluateCandidate } from "./eval-gate"

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCK_PATH = join(
  HERE,
  "../../../../scripts/brain-build/eval-thresholds.lock",
)

const signatureFields = {
  counterpartyKey: "CZ12345678",
  direction: "RECEIVED",
  supplyKind: "SERVICES",
  jurisdiction: "DOMESTIC",
} as const

function approvedRow(id: string, account: string): RawCorrectionRow {
  return {
    id,
    conversationId: null,
    toolName: "createAccountingEvent",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: { ...signatureFields, account: "999" },
    outputJson: {
      resolution: "approved",
      edit: {
        postingLines: [{ accountId: account, side: "DEBIT", amount: "100.00" }],
      },
    },
  }
}

describe("BOOKING_RULE_PR_GATE_THRESHOLD drift guard", () => {
  it("matches the committed booking_rule_pr_gate bound in eval-thresholds.lock", () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as {
      thresholds: { booking_rule_pr_gate: { bound: number; dir: string } }
    }
    expect(BOOKING_RULE_PR_GATE_THRESHOLD.bound).toBe(
      lock.thresholds.booking_rule_pr_gate.bound,
    )
    expect(BOOKING_RULE_PR_GATE_THRESHOLD.dir).toBe(
      lock.thresholds.booking_rule_pr_gate.dir,
    )
  })
})

describe("evaluateCandidate", () => {
  it("REJECTS a candidate whose cluster agreement falls below the 0.90 bound", () => {
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

  it("PASSES a candidate whose cluster agreement clears the 0.90 bound", () => {
    // 10 corrections, 9 agree with the majority (90% === bound, "min" direction passes on equality).
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
        toolName: "createAccountingEvent",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: signatureFields,
        outputJson: { resolution: "rejected" },
      },
      {
        id: "b",
        conversationId: null,
        toolName: "createAccountingEvent",
        createdAt: "2026-01-01T00:00:00.000Z",
        inputJson: signatureFields,
        outputJson: { resolution: "rejected" },
      },
      {
        id: "c",
        conversationId: null,
        toolName: "createAccountingEvent",
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
