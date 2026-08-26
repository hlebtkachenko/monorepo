import { describe, expect, it } from "vitest"

import type { ReportingPeriodView } from "@/lib/data/projections"

import { formatReportingPeriodLabel } from "./period-label"

function period(overrides: Partial<ReportingPeriodView>): ReportingPeriodView {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kind: "year",
    year: 2026,
    month: null,
    quarter: null,
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    ...overrides,
  }
}

describe("formatReportingPeriodLabel", () => {
  it("renders a month period as MM/YYYY, zero-padded", () => {
    expect(
      formatReportingPeriodLabel(
        period({ kind: "month", year: 2026, month: 7 }),
      ),
    ).toBe("07/2026")
    expect(
      formatReportingPeriodLabel(
        period({ kind: "month", year: 2026, month: 11 }),
      ),
    ).toBe("11/2026")
  })

  it("renders a quarter period as QN YYYY", () => {
    expect(
      formatReportingPeriodLabel(
        period({ kind: "quarter", year: 2026, quarter: 3 }),
      ),
    ).toBe("Q3 2026")
  })

  it("renders a year period as YYYY", () => {
    expect(
      formatReportingPeriodLabel(period({ kind: "year", year: 2026 })),
    ).toBe("2026")
  })
})
