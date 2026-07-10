import { describe, expect, it } from "vitest"

import { clusterCorrections } from "./cluster"
import { ingestCorrections, type RawCorrectionRow } from "./correction"

function row(
  id: string,
  overrides: Partial<RawCorrectionRow>,
): RawCorrectionRow {
  return {
    id,
    conversationId: null,
    toolName: "createAccountingEvent",
    createdAt: "2026-01-01T00:00:00.000Z",
    inputJson: {
      counterpartyKey: "CZ1",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
      account: "518",
    },
    outputJson: { resolution: "approved" },
    ...overrides,
  }
}

describe("clusterCorrections", () => {
  it("groups records that share a signature and separates ones that don't", () => {
    const records = ingestCorrections([
      row("a", {}),
      row("b", {}),
      row("c", {
        inputJson: {
          counterpartyKey: "CZ2",
          direction: "ISSUED",
          supplyKind: "GOODS",
          jurisdiction: "EU",
          account: "601",
        },
      }),
    ])
    const clusters = clusterCorrections(records)
    expect(clusters).toHaveLength(2)
    expect(clusters[0]!.corrections.map((c) => c.id)).toEqual(["a", "b"])
    expect(clusters[1]!.corrections.map((c) => c.id)).toEqual(["c"])
  })

  it("returns a size-1 cluster untouched (distillation, not clustering, sets the evidence bar)", () => {
    const records = ingestCorrections([row("solo", {})])
    const clusters = clusterCorrections(records)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.corrections).toHaveLength(1)
  })

  it("returns an empty array for no records", () => {
    expect(clusterCorrections([])).toEqual([])
  })
})
