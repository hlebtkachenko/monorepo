/**
 * The obrat thresholds (spec §2.1 item 4).
 *
 * This is the one classification in the portal whose answer is a legal position
 * — whether a company has a DPH registration duty — so the two things worth
 * asserting hardest are that the comparison is EXACT (no float rounding a figure
 * across a threshold) and that it is STRICT (the law is written on exceeding,
 * so landing on the threshold is not crossing it).
 */
import { describe, expect, it } from "vitest"

import {
  TURNOVER_PAYER_BY_LAW_THRESHOLD,
  TURNOVER_REGISTRATION_THRESHOLD,
  TURNOVER_SOURCES,
  turnoverTier,
} from "./turnover"

describe("the 2025+ two-tier thresholds", () => {
  it("states both in the SoT's own figures", () => {
    expect(TURNOVER_REGISTRATION_THRESHOLD).toBe("2000000.00")
    expect(TURNOVER_PAYER_BY_LAW_THRESHOLD).toBe("2536500.00")
  })
})

describe("turnoverTier", () => {
  it("is below the line under 2 000 000 Kč", () => {
    expect(turnoverTier("0.00")).toBe("below")
    expect(turnoverTier("1999999.99")).toBe("below")
  })

  it("does not cross on the threshold itself — the law is on EXCEEDING", () => {
    // Reporting a registration duty this company does not have would be the
    // worst error this function can make.
    expect(turnoverTier("2000000.00")).toBe("below")
    expect(turnoverTier("2536500.00")).toBe("registration_duty")
  })

  it("crosses one haléř over each threshold", () => {
    expect(turnoverTier("2000000.01")).toBe("registration_duty")
    expect(turnoverTier("2536500.01")).toBe("payer_by_law")
  })

  it("reads the whole range between the two tiers as the registration duty", () => {
    expect(turnoverTier("2400000.00")).toBe("registration_duty")
  })

  it("compares exactly, at a scale where a float would already have drifted", () => {
    // 2 536 500,01 and 2 536 500,00 are one haléř apart at the top of the
    // numeric(14,2) range this column can hold; the classification has to
    // change between them and not before.
    expect(turnoverTier("99999999999.99")).toBe("payer_by_law")
    expect(turnoverTier("2536499.99")).toBe("registration_duty")
  })

  it("handles a value with fewer decimals than the column stores", () => {
    // A driver, or an ingestion payload, may hand back "2536501" rather than
    // "2536501.00" — same number, and it must classify the same way.
    expect(turnoverTier("2536501")).toBe("payer_by_law")
    expect(turnoverTier("2000000")).toBe("below")
  })

  it("never reports a duty for a negative or empty-shaped figure", () => {
    expect(turnoverTier("-50000.00")).toBe("below")
  })
})

describe("TURNOVER_SOURCES — §0.4, empty beats stale", () => {
  it("names both feeds spec §2.1 gives for obrat", () => {
    expect(TURNOVER_SOURCES.map((source) => source.source)).toEqual([
      "indicator",
      "vzz_import",
    ])
  })

  it("declares both as unconnected, so the card cannot render a computed obrat", () => {
    // The moment either flips to true, a real reading has to reach the card —
    // this assertion is what makes that a deliberate change rather than a
    // silent one.
    expect(TURNOVER_SOURCES.every((source) => !source.implemented)).toBe(true)
  })
})
