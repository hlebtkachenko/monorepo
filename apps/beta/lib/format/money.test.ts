import { describe, expect, it } from "vitest"

import { formatBetaAmount, formatBetaMoney } from "./money"

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

describe("formatBetaAmount", () => {
  it("renders a statement cell grouped, two decimals, without a currency symbol", () => {
    expect(formatBetaAmount("3800000.00")?.replace(/\s/g, "")).toBe(
      "3800000,00",
    )
    expect(formatBetaAmount("3800000.00")).not.toContain("Kč")
  })

  it("keeps the minus sign a korekce column is printed with", () => {
    expect(formatBetaAmount("-1200000.00")?.replace(/\s/g, "")).toBe(
      "-1200000,00",
    )
  })

  it("pads a whole number to two decimals so a column lines up", () => {
    expect(formatBetaAmount("1234")?.replace(/\s/g, "")).toBe("1234,00")
  })

  it("returns null for null — an unstated cell is not a zero (spec §0.4)", () => {
    expect(formatBetaAmount(null)).toBeNull()
    expect(formatBetaAmount("0.00")?.replace(/\s/g, "")).toBe("0,00")
  })
})
