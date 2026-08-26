/**
 * The §0.4 freshness band (Advisor F24).
 *
 * The whole module is a boundary: "lags by more than one period" is one
 * off-by-one away from either warning about a dataset that arrived on time
 * (which trains a client to ignore the band) or staying silent about one that is
 * a quarter stale (which is the lie the band exists to prevent). Every case
 * below is one step either side of that line, in each of the three period kinds.
 */
import { describe, expect, it } from "vitest"

import { freshnessBand, periodsSincePeriod } from "./freshness"

const month = (year: number, monthValue: number) =>
  ({ kind: "month", year, month: monthValue, quarter: null }) as const

const quarter = (year: number, quarterValue: number) =>
  ({ kind: "quarter", year, month: null, quarter: quarterValue }) as const

const yearly = (year: number) =>
  ({ kind: "year", year, month: null, quarter: null }) as const

describe("periodsSincePeriod — monthly", () => {
  it("counts the month we are inside as zero", () => {
    expect(periodsSincePeriod(month(2026, 8), "2026-08-26")).toBe(0)
  })

  it("counts the month just ended as one", () => {
    expect(periodsSincePeriod(month(2026, 7), "2026-08-26")).toBe(1)
  })

  it("crosses a year boundary without arithmetic going backwards", () => {
    expect(periodsSincePeriod(month(2025, 12), "2026-01-05")).toBe(1)
    expect(periodsSincePeriod(month(2025, 11), "2026-01-05")).toBe(2)
  })

  it("is negative for a period published ahead of time", () => {
    expect(periodsSincePeriod(month(2026, 9), "2026-08-26")).toBe(-1)
  })
})

describe("periodsSincePeriod — quarterly and yearly", () => {
  it("counts quarters in quarters, not in months", () => {
    // Q2 2026 ended in June; on 26 August we are one quarter past it — a
    // monthly comparison would have said two and warned about a dataset that
    // is exactly on time.
    expect(periodsSincePeriod(quarter(2026, 2), "2026-08-26")).toBe(1)
    expect(periodsSincePeriod(quarter(2026, 1), "2026-08-26")).toBe(2)
  })

  it("puts the last day of a quarter in that quarter", () => {
    expect(periodsSincePeriod(quarter(2026, 3), "2026-09-30")).toBe(0)
    expect(periodsSincePeriod(quarter(2026, 3), "2026-10-01")).toBe(1)
  })

  it("counts years in years", () => {
    expect(periodsSincePeriod(yearly(2025), "2026-08-26")).toBe(1)
    expect(periodsSincePeriod(yearly(2024), "2026-08-26")).toBe(2)
  })
})

describe("freshnessBand — §0.4's three states", () => {
  it("calls a dataset with no published period ABSENT, never lagging", () => {
    // The distinction the surface renders as "zatím nenahráno" rather than as
    // "novější zatím nebyly nahrány" — one says nothing has ever arrived, the
    // other says something has and is old.
    expect(freshnessBand(null, "2026-08-26")).toBe("absent")
  })

  it("allows exactly one period of slack", () => {
    // The office publishes July during August. That is on time, not late.
    expect(freshnessBand(month(2026, 8), "2026-08-26")).toBe("current")
    expect(freshnessBand(month(2026, 7), "2026-08-26")).toBe("current")
  })

  it("warns from two periods behind", () => {
    expect(freshnessBand(month(2026, 6), "2026-08-26")).toBe("lagging")
    expect(freshnessBand(quarter(2026, 1), "2026-08-26")).toBe("lagging")
    expect(freshnessBand(yearly(2024), "2026-08-26")).toBe("lagging")
  })

  it("treats a period ahead of today as current", () => {
    expect(freshnessBand(month(2026, 9), "2026-08-26")).toBe("current")
  })
})
