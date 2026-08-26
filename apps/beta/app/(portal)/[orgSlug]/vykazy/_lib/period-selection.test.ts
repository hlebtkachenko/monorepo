import { describe, expect, it } from "vitest"

import type { ReportingPeriodView } from "@/lib/data/projections"

import { isStale, periodsBehind, selectPeriod } from "./period-selection"

function month(
  id: string,
  year: number,
  monthNumber: number,
): ReportingPeriodView {
  const mm = String(monthNumber).padStart(2, "0")
  return {
    id,
    kind: "month",
    year,
    month: monthNumber,
    quarter: null,
    startsOn: `${year}-${mm}-01`,
    endsOn: `${year}-${mm}-28`,
  }
}

function year(id: string, value: number): ReportingPeriodView {
  return {
    id,
    kind: "year",
    year: value,
    month: null,
    quarter: null,
    startsOn: `${value}-01-01`,
    endsOn: `${value}-12-31`,
  }
}

const JULY = month("p-07", 2026, 7)
const JUNE = month("p-06", 2026, 6)
const MAY = month("p-05", 2026, 5)

describe("selectPeriod", () => {
  const periods = [JULY, JUNE, MAY]

  it("defaults to the newest published period", () => {
    expect(selectPeriod(periods, undefined)?.id).toBe("p-07")
  })

  it("honours a requested period that IS published", () => {
    expect(selectPeriod(periods, "p-05")?.id).toBe("p-05")
  })

  it("falls back to the default for a period id that is not in the list", () => {
    // A foreign organization's id, a period this dataset has nothing for, or a
    // typo — all the same answer, and never an empty page that reads like a
    // data gap.
    expect(selectPeriod(periods, "p-99")?.id).toBe("p-07")
    expect(selectPeriod(periods, "")?.id).toBe("p-07")
  })

  it("answers null when nothing has ever been published", () => {
    expect(selectPeriod([], undefined)).toBeNull()
    expect(selectPeriod([], "p-07")).toBeNull()
  })
})

describe("periodsBehind", () => {
  it("counts months between the newest published and the newest known", () => {
    expect(periodsBehind(MAY, JULY)).toBe(2)
    expect(periodsBehind(JUNE, JULY)).toBe(1)
  })

  it("crosses a year boundary correctly", () => {
    expect(periodsBehind(month("a", 2025, 11), month("b", 2026, 1))).toBe(2)
  })

  it("is null when the published period is the newest, or ahead of it", () => {
    expect(periodsBehind(JULY, JULY)).toBeNull()
    expect(periodsBehind(JULY, MAY)).toBeNull()
  })

  it("refuses to compare periods of different kinds", () => {
    // 12/2026 and 2026 end on the same day and "one period later" means a
    // different thing on each timeline — a number here would look like an
    // answer and be nonsense.
    expect(periodsBehind(JULY, year("y", 2026))).toBeNull()
    expect(periodsBehind(year("y", 2025), JULY)).toBeNull()
  })

  it("is null when either side is missing", () => {
    expect(periodsBehind(null, JULY)).toBeNull()
    expect(periodsBehind(JULY, null)).toBeNull()
  })

  it("compares year periods on their own timeline", () => {
    expect(periodsBehind(year("a", 2024), year("b", 2026))).toBe(2)
  })
})

describe("isStale", () => {
  it("does not fire one period behind — that is a normal monthly close", () => {
    expect(isStale(1)).toBe(false)
    expect(isStale(null)).toBe(false)
  })

  it("fires from two periods behind, which is a missed month", () => {
    expect(isStale(2)).toBe(true)
    expect(isStale(5)).toBe(true)
  })
})
