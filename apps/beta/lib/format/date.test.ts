import { describe, expect, it } from "vitest"

import { currentBetaYear, formatBetaDate } from "./date"

describe("formatBetaDate", () => {
  it("renders a plain ISO date as DD.MM.YYYY", () => {
    expect(formatBetaDate("2026-04-27").replace(/\s/g, "")).toBe("27.04.2026")
  })

  it("renders an ISO instant as DD.MM.YYYY, Prague-local", () => {
    expect(formatBetaDate("2026-04-26T09:00:00.000Z").replace(/\s/g, "")).toBe(
      "26.04.2026",
    )
  })

  it("never rolls a date-only value back a day near the UTC boundary", () => {
    // UTC midnight, formatted in Europe/Prague (always ≥ UTC+1): the day
    // component must stay the one the date string names, never the day before.
    expect(formatBetaDate("2026-01-01").replace(/\s/g, "")).toBe("01.01.2026")
  })
})

describe("currentBetaYear", () => {
  it("returns a four-digit year", () => {
    expect(currentBetaYear()).toBeGreaterThan(2000)
    expect(String(currentBetaYear())).toHaveLength(4)
  })
})
