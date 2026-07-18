import { describe, it, expect } from "vitest"

import {
  resolveActivePeriod,
  resolveActivePeriodId,
  type HeaderPeriod,
} from "./period"

const p = (id: string, status: "OPEN" | "CLOSED"): HeaderPeriod => ({
  id,
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  status,
})

describe("resolveActivePeriod precedence", () => {
  const periods = [p("newest", "CLOSED"), p("open", "OPEN"), p("old", "CLOSED")]

  it("honors a requested id that names one of the periods", () => {
    expect(resolveActivePeriodId(periods, "old")).toBe("old")
  })

  it("falls back to the newest OPEN period when the request does not match", () => {
    expect(resolveActivePeriodId(periods, "does-not-exist")).toBe("open")
  })

  it("falls back to the newest OPEN when no request is given", () => {
    expect(resolveActivePeriodId(periods, null)).toBe("open")
    expect(resolveActivePeriodId(periods, undefined)).toBe("open")
  })

  it("falls back to the newest period when none are OPEN", () => {
    const closed = [p("newest", "CLOSED"), p("old", "CLOSED")]
    expect(resolveActivePeriodId(closed, null)).toBe("newest")
  })

  it("returns null when the org has no periods", () => {
    expect(resolveActivePeriod([], "anything")).toBeNull()
    expect(resolveActivePeriodId([], null)).toBeNull()
  })
})
