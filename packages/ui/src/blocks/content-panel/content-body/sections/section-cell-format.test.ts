import { describe, expect, it } from "vitest"

import {
  compareCurrency,
  compareDate,
  formatCurrencyCell,
  formatDateCell,
  sortingFnForKind,
} from "./section-cell-format"
import type { TableCellValue } from "./section-table"

const NBSP = "\u00A0"

describe("formatCurrencyCell", () => {
  it("formats a decimal STRING to the cs-CZ money form (2 decimals, grouped)", () => {
    expect(formatCurrencyCell("1234.50")).toBe(`1${NBSP}234,50`)
  })

  it("rounds a 4-decimal DB string to 2 fraction digits for display", () => {
    expect(formatCurrencyCell("1234.5000")).toBe(`1${NBSP}234,50`)
  })

  it("keeps precision past IEEE-754 double (the string is never Number()'d)", () => {
    expect(formatCurrencyCell("90071992547409911234.5")).toBe(
      `90${NBSP}071${NBSP}992${NBSP}547${NBSP}409${NBSP}911${NBSP}234,50`,
    )
  })

  it("formats a negative amount", () => {
    expect(formatCurrencyCell("-50.5")).toBe(`-50,50`)
  })

  it("renders null / blank as an empty string", () => {
    expect(formatCurrencyCell(null)).toBe("")
    expect(formatCurrencyCell("")).toBe("")
  })
})

describe("formatDateCell", () => {
  it("formats an ISO date to the cs-CZ short date", () => {
    expect(formatDateCell("2026-06-01")).toBe("1. 6. 2026")
  })

  it("renders null / blank as an empty string", () => {
    expect(formatDateCell(null)).toBe("")
    expect(formatDateCell("")).toBe("")
  })

  it("passes an unparseable value through untouched", () => {
    expect(formatDateCell("not-a-date")).toBe("not-a-date")
  })
})

describe("compareCurrency (numeric sort on decimal strings)", () => {
  it("orders '90' BEFORE '1000' (numeric, not lexicographic)", () => {
    // Lexicographically "1000" < "90"; numerically 90 < 1000 — prove numeric.
    expect(compareCurrency("90", "1000")).toBeLessThan(0)
    expect(compareCurrency("1000", "90")).toBeGreaterThan(0)
  })

  it("sorts a decimal-string column numerically end-to-end", () => {
    const values: TableCellValue[] = ["1000.00", "90.50", "9.99", "250.00"]
    const sorted = [...values].sort(compareCurrency)
    expect(sorted).toEqual(["9.99", "90.50", "250.00", "1000.00"])
  })

  it("treats null / non-numeric as the smallest (sinks in ascending)", () => {
    expect(compareCurrency(null, "0")).toBeLessThan(0)
    expect(compareCurrency("n/a", "0")).toBeLessThan(0)
  })

  it("compares equal values as 0", () => {
    expect(compareCurrency("12.00", "12")).toBe(0)
  })
})

describe("compareDate (chronological sort on ISO strings)", () => {
  it("orders an earlier ISO date before a later one", () => {
    expect(compareDate("2026-01-05", "2026-11-02")).toBeLessThan(0)
    expect(compareDate("2026-11-02", "2026-01-05")).toBeGreaterThan(0)
  })

  it("sorts an ISO-date column chronologically end-to-end", () => {
    const values: TableCellValue[] = [
      "2026-06-10",
      "2026-06-01",
      "2026-06-09",
      "2026-06-02",
    ]
    const sorted = [...values].sort(compareDate)
    expect(sorted).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-09",
      "2026-06-10",
    ])
  })
})

describe("sortingFnForKind (exhaustive kind → comparator)", () => {
  it("returns a comparator for the string-carried kinds", () => {
    expect(typeof sortingFnForKind("currency")).toBe("function")
    expect(typeof sortingFnForKind("date")).toBe("function")
  })

  it("defers to TanStack's inferred sort for the value-typed kinds", () => {
    expect(sortingFnForKind("text")).toBeUndefined()
    expect(sortingFnForKind("number")).toBeUndefined()
    expect(sortingFnForKind("select")).toBeUndefined()
    expect(sortingFnForKind("badge")).toBeUndefined()
  })
})
