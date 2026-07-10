import { describe, expect, it } from "vitest"

import { resolveDppoRate } from "../src/output/annual-rules"

describe("DPPO effective rate resolution", () => {
  it.each([
    ["2023-01-01", "0.19"],
    ["2024-01-01", "0.21"],
    ["2026-01-01", "0.21"],
  ])("uses the rule effective on %s", (periodStart, expectedRate) => {
    const result = resolveDppoRate(periodStart, "STANDARD")
    expect(result.status).toBe("SUPPORTED")
    if (result.status === "SUPPORTED") expect(result.rate).toBe(expectedRate)
  })

  it("uses the first day for a non-calendar taxable period", () => {
    const startedIn2023 = resolveDppoRate("2023-07-01", "STANDARD")
    const startedIn2024 = resolveDppoRate("2024-07-01", "STANDARD")
    expect(startedIn2023.status === "SUPPORTED" && startedIn2023.rate).toBe(
      "0.19",
    )
    expect(startedIn2024.status === "SUPPORTED" && startedIn2024.rate).toBe(
      "0.21",
    )
  })

  it("does not silently apply the standard rate to an unknown category", () => {
    expect(resolveDppoRate("2026-01-01", undefined)).toEqual(
      expect.objectContaining({ status: "UNSUPPORTED", category: "UNKNOWN" }),
    )
    expect(resolveDppoRate("2026-01-01", "OTHER")).toEqual(
      expect.objectContaining({ status: "UNSUPPORTED", category: "OTHER" }),
    )
  })

  it("keeps unverified historical special-category rates unsupported", () => {
    expect(resolveDppoRate("2023-01-01", "BASIC_INVESTMENT_FUND")).toEqual(
      expect.objectContaining({ status: "UNSUPPORTED" }),
    )
    expect(resolveDppoRate("2024-01-01", "BASIC_INVESTMENT_FUND")).toEqual(
      expect.objectContaining({ status: "SUPPORTED", rate: "0.05" }),
    )
  })
})
