/**
 * Unit tests for the pure period-formatting helpers in `data.ts`:
 *   - formatPeriodLabel: calendar-year collapse vs full MM.YYYY range
 *   - toCompanyPeriods: maps accounting_period rows into the card's picker shape,
 *     preserving input order
 */

import { describe, expect, it } from "vitest"

import { formatPeriodLabel, toCompanyPeriods } from "./data"

describe("formatPeriodLabel", () => {
  it("collapses a full calendar year (Jan–Dec, same year) to just the year", () => {
    expect(formatPeriodLabel("2025-01-01", "2025-12-31")).toBe("2025")
  })

  it("renders a non-calendar-year range as MM.YYYY – MM.YYYY", () => {
    expect(formatPeriodLabel("2025-04-01", "2026-03-31")).toBe(
      "04.2025 – 03.2026",
    )
  })
})

describe("toCompanyPeriods", () => {
  it("maps id → value, status → open, and preserves input order", () => {
    const rows = [
      {
        id: "p2026",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        status: "CLOSED" as const,
      },
      {
        id: "p2025",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        status: "OPEN" as const,
      },
    ]

    expect(toCompanyPeriods(rows)).toEqual([
      { value: "p2026", label: "2026", open: false },
      { value: "p2025", label: "2025", open: true },
    ])
  })

  it("returns an empty list for no rows", () => {
    expect(toCompanyPeriods([])).toEqual([])
  })
})
