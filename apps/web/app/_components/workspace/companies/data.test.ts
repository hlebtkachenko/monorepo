/**
 * Unit tests for the pure period-formatting helpers in `data.ts`:
 *   - formatPeriodLabel: calendar-year collapse vs full MM.YYYY range
 *   - toCompanyPeriods: maps accounting_period rows into the card's picker shape,
 *     preserving input order
 */

import { describe, expect, it } from "vitest"

import {
  applySearch,
  formatPeriodLabel,
  toCompanyPeriods,
  vatRegimeLabel,
} from "./data"
import type { CompanyRow } from "./data"

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

describe("vatRegimeLabel", () => {
  it("maps each known vat_regime_code to its display label", () => {
    expect(vatRegimeLabel("NON_PAYER")).toBe("Non-payer")
    expect(vatRegimeLabel("PAYER")).toBe("Payer")
    expect(vatRegimeLabel("IDENTIFIED_PERSON")).toBe("Identified person")
  })

  it("defaults to Non-payer for no row / an unrecognized code", () => {
    expect(vatRegimeLabel(undefined)).toBe("Non-payer")
    expect(vatRegimeLabel(null)).toBe("Non-payer")
    expect(vatRegimeLabel("SOMETHING_ELSE")).toBe("Non-payer")
  })
})

describe("applySearch", () => {
  const baseRow: CompanyRow = {
    id: "org-1",
    slug: "acme",
    legalName: "Acme s.r.o.",
    typeLabel: "s.r.o.",
    fiscalYear: "2026",
    members: [],
    archived: false,
    periods: [],
    vatRegime: "Payer",
    status: "Active",
    nextDeadline: "No upcoming deadline",
    assignee: null,
  }

  it("matches on the assignee's name when assigned", () => {
    const assigned: CompanyRow = {
      ...baseRow,
      assignee: { userId: "u-1", name: "Jana Nováková" },
    }
    expect(applySearch([assigned], "nováková")).toEqual([assigned])
  })

  it("does not throw and excludes the row when unassigned", () => {
    expect(applySearch([baseRow], "nováková")).toEqual([])
    expect(applySearch([baseRow], "")).toEqual([baseRow])
  })
})
