import { describe, expect, it } from "vitest"

import {
  groupByMonth,
  type ObligationWithStatus,
} from "../src/obligations/presentation"

function makeObligation(
  dueDate: string,
  overrides: Partial<ObligationWithStatus> = {},
): ObligationWithStatus {
  return {
    kind: "VAT_RETURN",
    category: "VAT",
    title: "VAT return",
    periodLabel: "Jan 2026",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    dueDate,
    applicability: {
      status: "APPLICABLE",
      reason: "Configured statutory schedule applies.",
    },
    status: "Upcoming",
    ...overrides,
  }
}

describe("groupByMonth", () => {
  it("groups dueDate-sorted obligations into per-month buckets, in order", () => {
    const obligations = [
      makeObligation("2026-01-25"),
      makeObligation("2026-02-25"),
      makeObligation("2026-03-25"),
    ]

    const groups = groupByMonth(obligations)

    expect(groups.map((g) => g.monthKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ])
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 1])
  })

  it("does not duplicate a month header — same-month rows land in one group", () => {
    const obligations = [
      makeObligation("2026-01-05", { kind: "VAT_RETURN" }),
      makeObligation("2026-01-25", { kind: "CONTROL_STATEMENT" }),
      makeObligation("2026-01-25", { kind: "EC_SALES_LIST" }),
      makeObligation("2026-02-25", { kind: "VAT_RETURN" }),
    ]

    const groups = groupByMonth(obligations)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.monthKey).toBe("2026-01")
    expect(groups[0]?.rows).toHaveLength(3)
    expect(groups[1]?.monthKey).toBe("2026-02")
    expect(groups[1]?.rows).toHaveLength(1)
  })

  it("re-splits a month if it is not contiguous in the input (pins the engine-sort dependency)", () => {
    const obligations = [
      makeObligation("2026-01-05"),
      makeObligation("2026-02-05"),
      makeObligation("2026-01-25"),
    ]

    const groups = groupByMonth(obligations)

    expect(groups.map((g) => g.monthKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-01",
    ])
  })

  it("returns an empty array for no obligations", () => {
    expect(groupByMonth([])).toEqual([])
  })
})
