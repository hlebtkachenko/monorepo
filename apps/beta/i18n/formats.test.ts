import { describe, expect, it } from "vitest"

import {
  BETA_LOCALE,
  BETA_TIME_ZONE,
  WEEK_STARTS_ON,
  betaFormats,
} from "./formats"
import { betaMessages } from "./messages"

describe("beta cs-CZ formats", () => {
  it("renders dates as DD.MM.YYYY", () => {
    const formatted = new Intl.DateTimeFormat(BETA_LOCALE, {
      ...betaFormats.dateTime.date,
      timeZone: BETA_TIME_ZONE,
    })
      .format(new Date("2026-03-07T10:00:00Z"))
      // cs-CZ separates the parts with ". " — compare on digits + dots only.
      .replace(/\s/g, "")
    expect(formatted).toBe("07.03.2026")
  })

  it("renders money in Kč", () => {
    const formatted = new Intl.NumberFormat(
      BETA_LOCALE,
      betaFormats.number.currency,
    ).format(1234.5)
    expect(formatted).toContain("Kč")
    expect(formatted.replace(/\s/g, "")).toBe("1234,50Kč")
  })

  it("starts the week on Monday", () => {
    expect(WEEK_STARTS_ON).toBe(1)
  })
})

describe("beta catalog", () => {
  it("carries beta's own namespaces plus the shared brand namespace", () => {
    expect(Object.keys(betaMessages)).toContain("landing")
    expect(betaMessages.brand.name).toBe("Afframe")
  })
})
