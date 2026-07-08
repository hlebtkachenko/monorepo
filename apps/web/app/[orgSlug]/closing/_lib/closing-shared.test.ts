import { describe, expect, it } from "vitest"

import {
  groupByMonth,
  monthGroupLabel,
  type ObligationWithStatus,
} from "./closing-shared"

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
    conditional: false,
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
    // If computeObligations ever stopped returning dueDate-sorted rows, this
    // is the behavior change that would surface: the same calendar month
    // appears twice instead of merging into one group.
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

describe("monthGroupLabel", () => {
  it("formats a YYYY-MM month key as a full month name + year", () => {
    expect(monthGroupLabel("2026-07")).toBe("July 2026")
    expect(monthGroupLabel("2026-01")).toBe("January 2026")
    expect(monthGroupLabel("2026-12")).toBe("December 2026")
  })

  it("falls back to the raw key for a malformed input", () => {
    expect(monthGroupLabel("garbage")).toBe("garbage")
  })
})
