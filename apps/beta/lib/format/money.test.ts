import { describe, expect, it } from "vitest"

import { formatBetaMoney } from "./money"

describe("formatBetaMoney", () => {
  it("renders a positive amount in Kč", () => {
    expect(formatBetaMoney("18450.50")?.replace(/\s/g, "")).toBe("18450,50Kč")
  })

  it("renders a negative amount (a nadměrný odpočet) with its sign", () => {
    const formatted = formatBetaMoney("-2400.00")
    expect(formatted).toContain("-")
    expect(formatted).toContain("Kč")
  })

  it("returns null for null — 'not stated' is not zero (spec §0.4)", () => {
    expect(formatBetaMoney(null)).toBeNull()
  })

  it("renders an actual zero as 0 Kč, distinct from null", () => {
    expect(formatBetaMoney("0.00")?.replace(/\s/g, "")).toBe("0,00Kč")
  })
})
