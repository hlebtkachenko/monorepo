import { describe, expect, it } from "vitest"

import { betaTodayIso, currentBetaYear, formatBetaDate } from "./date"

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

describe("betaTodayIso", () => {
  it("renders a Prague calendar day as YYYY-MM-DD", () => {
    expect(betaTodayIso(new Date("2026-08-26T09:00:00.000Z"))).toBe(
      "2026-08-26",
    )
  })

  it("answers in Prague, not UTC — the freshness band must not flip a day early", () => {
    // 23:30 UTC on 31 July is already 01:30 on 1 August in Prague. A UTC
    // answer here would put a monthly dataset one period further behind than
    // it is for a whole hour every night, and two periods behind is a warning
    // band on the client's screen.
    expect(betaTodayIso(new Date("2026-07-31T23:30:00.000Z"))).toBe(
      "2026-08-01",
    )
  })

  it("pads a single-digit month and day", () => {
    expect(betaTodayIso(new Date("2026-01-05T12:00:00.000Z"))).toBe(
      "2026-01-05",
    )
  })
})
