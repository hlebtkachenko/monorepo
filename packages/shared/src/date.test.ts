import { describe, expect, it } from "vitest"

import { czechToday, monthGroupLabel } from "./date"

describe("czechToday", () => {
  it("uses the Czech date across the winter UTC midnight boundary", () => {
    expect(czechToday(new Date("2026-01-01T22:59:59.999Z"))).toBe("2026-01-01")
    expect(czechToday(new Date("2026-01-01T23:00:00.000Z"))).toBe("2026-01-02")
  })

  it("uses the Czech date across the summer UTC midnight boundary", () => {
    expect(czechToday(new Date("2026-07-09T21:59:59.999Z"))).toBe("2026-07-09")
    expect(czechToday(new Date("2026-07-09T22:00:00.000Z"))).toBe("2026-07-10")
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
