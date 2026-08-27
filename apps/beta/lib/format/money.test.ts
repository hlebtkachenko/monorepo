import { describe, expect, it } from "vitest"

import {
  formatAmount,
  formatBetaAmount,
  formatBetaMoney,
  normalizeBetaMoneyInput,
} from "./money"

/** cs-CZ uses non-breaking and narrow spaces; compare on the glyphs. */
const squash = (value: string | null): string =>
  (value ?? "").replace(/\s/g, "")

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

describe("normalizeBetaMoneyInput", () => {
  it("strips Czech grouping (U+00A0, U+202F, ASCII space) and rewrites a comma", () => {
    expect(normalizeBetaMoneyInput("150 000,50")).toBe("150000.50")
    expect(normalizeBetaMoneyInput("650 000,00")).toBe("650000.00")
    expect(normalizeBetaMoneyInput("12 345,6")).toBe("12345.6")
    // No comma: grouping alone on a whole number.
    expect(normalizeBetaMoneyInput("1 000")).toBe("1000")
  })

  it("treats a dot as grouping only once a comma proves it was", () => {
    expect(normalizeBetaMoneyInput("1.234,56")).toBe("1234.56")
    // No comma: the dot stays a decimal point, left ambiguous for the caller's
    // own shape check to refuse rather than guessed at here.
    expect(normalizeBetaMoneyInput("1.234")).toBe("1.234")
  })

  it("passes ASCII numeric syntax through unchanged", () => {
    expect(normalizeBetaMoneyInput("150000.50")).toBe("150000.50")
    expect(normalizeBetaMoneyInput("-42")).toBe("-42")
  })
})

describe("formatAmount", () => {
  it("renders the numeric(14,2) text as Kč", () => {
    expect(squash(formatAmount("1234.50"))).toBe("1234,50Kč")
    expect(squash(formatAmount("0.00"))).toBe("0,00Kč")
    expect(squash(formatAmount("-99.90"))).toBe("-99,90Kč")
  })

  it("keeps both decimals of the widest value the column can hold", () => {
    expect(squash(formatAmount("999999999999.99"))).toBe("999999999999,99Kč")
  })

  it.each([null, undefined, "", "nic"])("answers null for %s", (value) => {
    expect(formatAmount(value)).toBeNull()
  })
})
