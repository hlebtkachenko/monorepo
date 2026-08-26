/**
 * The value formatters, held to the Czech conventions of plan v3 Part 3:
 * DD.MM.YYYY, Kč, Prague time.
 *
 * The interesting cases are all about NOT shifting a value: a date-only string
 * must not move a day because the machine running the test is behind UTC, and
 * an amount must render the exact decimals `numeric(14,2)` stored rather than
 * whatever a float rounds to.
 */
import { describe, expect, it } from "vitest"

import {
  formatAmount,
  formatBytes,
  formatDate,
  formatDateTime,
} from "./format-values"

/** cs-CZ uses non-breaking and narrow spaces; compare on the glyphs. */
const squash = (value: string | null): string =>
  (value ?? "").replace(/\s/g, "")

describe("formatDate", () => {
  it("renders a date-only value as DD.MM.YYYY", () => {
    expect(squash(formatDate("2026-03-07"))).toBe("07.03.2026")
  })

  it("keeps the calendar day of a date-only value in any machine timezone", () => {
    // 1 January is the value most likely to slip backwards a day.
    expect(squash(formatDate("2026-01-01"))).toBe("01.01.2026")
    expect(squash(formatDate("2026-12-31"))).toBe("31.12.2026")
  })

  it("reads a timestamp in Prague terms", () => {
    // 23:30 UTC on 6 March is already 7 March in Prague.
    expect(squash(formatDate("2026-03-06T23:30:00Z"))).toBe("07.03.2026")
  })

  it.each([null, undefined, "", "vcera", "2026-02-30T99:99"])(
    "answers null for %s",
    (value) => {
      expect(formatDate(value)).toBeNull()
    },
  )
})

describe("formatDateTime", () => {
  it("renders the Prague wall clock", () => {
    // 09:24 UTC in March is 10:24 in Prague (CET, before the DST switch).
    expect(squash(formatDateTime("2026-03-07T09:24:00Z"))).toBe(
      "07.03.202610:24",
    )
  })

  it("answers null for a value that is not a timestamp", () => {
    expect(formatDateTime("kdysi")).toBeNull()
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

describe("formatBytes", () => {
  it.each([
    [512, "512B"],
    [2048, "2kB"],
    [1024 * 1024, "1MB"],
    [25 * 1024 * 1024, "25MB"],
  ])("renders %s bytes as %s", (value, expected) => {
    expect(squash(formatBytes(value))).toBe(expected)
  })
})
