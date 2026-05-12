import { describe, expect, it } from "vitest"

import { formatNumber, parseNumber } from "./format-number"

const NBSP = " "

describe("formatNumber", () => {
  it("formats a million with NBSP thousand separators and comma decimal", () => {
    expect(formatNumber(1000000)).toBe(`1${NBSP}000${NBSP}000,00`)
  })

  it("uses NBSP (U+00A0), not a regular space", () => {
    const formatted = formatNumber(1000000).normalize("NFC")
    expect(formatted).toBe(`1${NBSP}000${NBSP}000,00`)
    expect(formatted).not.toBe("1 000 000,00")
  })

  it("formats fractional values with 2 default fraction digits", () => {
    expect(formatNumber(1234.5)).toBe(`1${NBSP}234,50`)
  })

  it("formats zero with default fraction digits", () => {
    expect(formatNumber(0)).toBe("0,00")
  })

  it("honors maximumFractionDigits override", () => {
    expect(formatNumber(-1234.567, { maximumFractionDigits: 3 })).toBe(
      `-1${NBSP}234,567`,
    )
  })

  it("honors minimumFractionDigits override", () => {
    expect(
      formatNumber(5, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    ).toBe("5")
  })

  it("returns empty string for null", () => {
    expect(formatNumber(null)).toBe("")
  })

  it("returns empty string for undefined", () => {
    expect(formatNumber(undefined)).toBe("")
  })

  it("returns empty string for NaN", () => {
    expect(formatNumber(Number.NaN)).toBe("")
  })

  it("returns empty string for Infinity", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("")
  })
})

describe("parseNumber", () => {
  it("parses NBSP-separated czech format", () => {
    expect(parseNumber(`1${NBSP}000${NBSP}000,00`)).toBe(1000000)
  })

  it("parses regular spaces as thousand separator", () => {
    expect(parseNumber("1 000 000,00")).toBe(1000000)
  })

  it("parses comma decimal", () => {
    expect(parseNumber("1234,5")).toBe(1234.5)
  })

  it("parses dot decimal", () => {
    expect(parseNumber("1234.5")).toBe(1234.5)
  })

  it("returns null for invalid input", () => {
    expect(parseNumber("abc")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseNumber("")).toBeNull()
  })

  it("round-trips through formatNumber", () => {
    const samples = [0, 1, -1234.56, 1000000, 999.99, -0.5]
    for (const n of samples) {
      const formatted = formatNumber(n)
      const parsed = parseNumber(formatted)
      expect(parsed).not.toBeNull()
      expect(Math.abs((parsed ?? 0) - n)).toBeLessThan(1e-9)
    }
  })
})
