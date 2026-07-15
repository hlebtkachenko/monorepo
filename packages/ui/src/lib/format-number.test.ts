import { describe, expect, it } from "vitest"

import {
  formatDecimal,
  formatMoney,
  formatNumber,
  maskNumberInput,
  parseNumber,
} from "./format-number"

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

  it("formats with an explicit locale", () => {
    expect(formatNumber(1000000, { locale: "en-US" })).toBe("1,000,000.00")
  })
})

describe("formatMoney", () => {
  it("formats CZK minor units in cs-CZ by default", () => {
    expect(formatMoney({ amount: 123456n, currency: "CZK" })).toBe(
      `1${NBSP}234,56${NBSP}Kč`,
    )
  })

  it("formats with an explicit locale", () => {
    expect(formatMoney({ amount: 123456n, currency: "USD" }, "en-US")).toBe(
      "$1,234.56",
    )
  })

  it("formats negative amounts", () => {
    expect(formatMoney({ amount: -50n, currency: "CZK" })).toBe(
      `-0,50${NBSP}Kč`,
    )
  })

  it("formats zero", () => {
    expect(formatMoney({ amount: 0n, currency: "CZK" })).toBe(`0,00${NBSP}Kč`)
  })

  it("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    expect(
      formatMoney({ amount: 9007199254740993n, currency: "EUR" }, "en-US"),
    ).toBe("€90,071,992,547,409.93")
  })

  it("formats zero-fraction-digit currencies (JPY)", () => {
    expect(formatMoney({ amount: 1234n, currency: "JPY" }, "en-US")).toBe(
      "¥1,234",
    )
  })

  it("returns empty string for null and undefined", () => {
    expect(formatMoney(null)).toBe("")
    expect(formatMoney(undefined)).toBe("")
  })
})

describe("formatDecimal", () => {
  it("formats a decimal STRING to the cs-CZ money form", () => {
    expect(formatDecimal("1234.50")).toBe(`1${NBSP}234,50`)
  })

  it("rounds a 4-decimal DB string to 2 fraction digits for display", () => {
    expect(formatDecimal("1234.5000")).toBe(`1${NBSP}234,50`)
  })

  it("groups thousands and keeps the comma decimal", () => {
    expect(formatDecimal("90071992.55")).toBe(`90${NBSP}071${NBSP}992,55`)
  })

  it("preserves precision beyond IEEE-754 double (never Number()'d)", () => {
    // 20 significant digits — a `Number()` round-trip would corrupt the tail.
    expect(formatDecimal("90071992547409911234.5")).toBe(
      `90${NBSP}071${NBSP}992${NBSP}547${NBSP}409${NBSP}911${NBSP}234,50`,
    )
  })

  it("formats a negative decimal string", () => {
    expect(formatDecimal("-50.5")).toBe(`-50,50`)
  })

  it("accepts a plain number for convenience", () => {
    expect(formatDecimal(1240)).toBe(`1${NBSP}240,00`)
  })

  it("returns empty for null / undefined / blank", () => {
    expect(formatDecimal(null)).toBe("")
    expect(formatDecimal(undefined)).toBe("")
    expect(formatDecimal("   ")).toBe("")
  })

  it("passes a non-numeric string through untouched (never 'NaN')", () => {
    expect(formatDecimal("n/a")).toBe("n/a")
  })

  it("honors a fraction-digit override", () => {
    expect(formatDecimal("1234.5678", { maximumFractionDigits: 4 })).toBe(
      `1${NBSP}234,5678`,
    )
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

describe("maskNumberInput", () => {
  it("keeps an empty field empty so the placeholder shows", () => {
    expect(maskNumberInput("", 0)).toEqual({ text: "", caret: 0 })
  })

  it("appends a ,00 suffix and keeps the caret after a single digit", () => {
    expect(maskNumberInput("1", 1)).toEqual({ text: "1,00", caret: 1 })
  })

  it("groups thousands as you type, caret after the last integer digit", () => {
    const result = maskNumberInput("1234", 4)
    expect(result.text).toBe(`1${NBSP}234,00`)
    expect(result.caret).toBe(5)
  })

  it("regroups when a digit pushes a new thousand separator", () => {
    const result = maskNumberInput("9999999", 7)
    expect(result.text).toBe(`9${NBSP}999${NBSP}999,00`)
    // 7 digits + 2 separators
    expect(result.caret).toBe(9)
  })

  it("keeps the committed ,00 while typing the next integer digit", () => {
    // field was "1,00", caret after the 1, user types another digit
    const result = maskNumberInput("12,00", 2)
    expect(result.text).toBe("12,00")
    expect(result.caret).toBe(2)
  })

  it("lets the user type decimals after a comma", () => {
    const result = maskNumberInput("1,5", 3)
    expect(result.text).toBe("1,5")
    expect(result.caret).toBe(3)
  })

  it("caps decimals at two digits", () => {
    expect(maskNumberInput("1,567", 5).text).toBe("1,56")
  })

  it("preserves a leading minus", () => {
    const result = maskNumberInput("-1234", 5)
    expect(result.text).toBe(`-1${NBSP}234,00`)
    expect(result.caret).toBe(6)
  })

  it("produces a draft that round-trips through parseNumber", () => {
    const { text } = maskNumberInput("40000", 5)
    expect(text).toBe(`40${NBSP}000,00`)
    expect(parseNumber(text)).toBe(40000)
  })
})
