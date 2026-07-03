import { describe, expect, it } from "vitest"

import { DHM_THRESHOLD_MINOR } from "./hard-class"
import { decimalToMinor, minorToDecimal } from "./money"

describe("decimalToMinor", () => {
  it("scales to haléř via string math, never the off-by-100 Number() path", () => {
    // The load-bearing case: "50000.00" is 5_000_000 haléř, NOT 50_000.
    expect(decimalToMinor("50000.00")).toBe(5_000_000n)
    expect(decimalToMinor("50000.00")).not.toBe(50_000n)
    expect(decimalToMinor("0")).toBe(0n)
    expect(decimalToMinor("1234.56")).toBe(123_456n)
    expect(decimalToMinor("-1234.56")).toBe(-123_456n)
  })

  it("accepts numeric(19,4) padding and 1-digit fractions (pad/truncate to 2 dp)", () => {
    expect(decimalToMinor("50000.0000")).toBe(5_000_000n)
    expect(decimalToMinor("40000")).toBe(4_000_000n)
    expect(decimalToMinor("12.5")).toBe(1_250n)
    // Sub-haléř precision is truncated (never rounded UP across a threshold).
    expect(decimalToMinor("40000.9999")).toBe(4_000_099n)
  })

  it("resolves the DHM 40 000 Kč threshold exactly at the haléř boundary", () => {
    expect(decimalToMinor("40000.00")).toBe(DHM_THRESHOLD_MINOR)
    expect(decimalToMinor("39999.99")).toBeLessThan(DHM_THRESHOLD_MINOR)
    expect(decimalToMinor("40000.01")).toBeGreaterThan(DHM_THRESHOLD_MINOR)
  })

  it("rejects non-decimal input", () => {
    expect(() => decimalToMinor("1,234.56")).toThrow()
    expect(() => decimalToMinor("abc")).toThrow()
    expect(() => decimalToMinor("")).toThrow()
  })
})

describe("minorToDecimal", () => {
  it("formats haléř back to a canonical 2-dp string", () => {
    expect(minorToDecimal(5_000_000n)).toBe("50000.00")
    expect(minorToDecimal(0n)).toBe("0.00")
    expect(minorToDecimal(5n)).toBe("0.05")
    expect(minorToDecimal(-123_456n)).toBe("-1234.56")
  })

  it("round-trips with decimalToMinor", () => {
    for (const s of ["0.00", "50000.00", "1234.56", "-99.90"]) {
      expect(minorToDecimal(decimalToMinor(s))).toBe(s)
    }
  })
})
