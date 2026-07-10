import { describe, expect, it } from "vitest"

import {
  BOOKING_REQUIRED_SERIES_ENTITY_TYPES,
  discoverBookability,
  explainBookability,
  type NumberSeriesLike,
  type PeriodLike,
} from "./discover"

const open: PeriodLike = { status: "OPEN" }
const closed: PeriodLike = { status: "CLOSED" }
const documentSeries: NumberSeriesLike = { entityType: "DOCUMENT" }
const eventSeries: NumberSeriesLike = { entityType: "EVENT" }
const assetSeries: NumberSeriesLike = { entityType: "ASSET" }

describe("discoverBookability", () => {
  it("is bookable with an OPEN period + both required series present", () => {
    const report = discoverBookability([open], [documentSeries, eventSeries])
    expect(report).toEqual({
      bookable: true,
      hasOpenPeriod: true,
      requiredEntityTypes: BOOKING_REQUIRED_SERIES_ENTITY_TYPES,
      missingSeriesEntityTypes: [],
    })
  })

  it("is NOT bookable with no periods at all", () => {
    const report = discoverBookability([], [documentSeries, eventSeries])
    expect(report.bookable).toBe(false)
    expect(report.hasOpenPeriod).toBe(false)
    // The series gap is independent of the period gap — both are reported.
    expect(report.missingSeriesEntityTypes).toEqual([])
  })

  it("is NOT bookable when every period is CLOSED", () => {
    const report = discoverBookability([closed], [documentSeries, eventSeries])
    expect(report.bookable).toBe(false)
    expect(report.hasOpenPeriod).toBe(false)
  })

  it("is NOT bookable when the DOCUMENT series is missing", () => {
    const report = discoverBookability([open], [eventSeries])
    expect(report.bookable).toBe(false)
    expect(report.hasOpenPeriod).toBe(true)
    expect(report.missingSeriesEntityTypes).toEqual(["DOCUMENT"])
  })

  it("is NOT bookable when the EVENT series is missing", () => {
    const report = discoverBookability([open], [documentSeries])
    expect(report.missingSeriesEntityTypes).toEqual(["EVENT"])
  })

  it("reports BOTH missing series when neither is present (an ASSET-only series does not count)", () => {
    const report = discoverBookability([open], [assetSeries])
    expect(report.missingSeriesEntityTypes).toEqual(["DOCUMENT", "EVENT"])
  })

  it("reports both a missing period AND a missing series together (no false narrowing)", () => {
    const report = discoverBookability([closed], [documentSeries])
    expect(report.hasOpenPeriod).toBe(false)
    expect(report.missingSeriesEntityTypes).toEqual(["EVENT"])
    expect(report.bookable).toBe(false)
  })

  it("honors a narrower requiredEntityTypes override", () => {
    const report = discoverBookability([open], [], ["DOCUMENT"])
    expect(report.missingSeriesEntityTypes).toEqual(["DOCUMENT"])
    expect(report.requiredEntityTypes).toEqual(["DOCUMENT"])
  })

  it("an empty requiredEntityTypes override makes series irrelevant", () => {
    const report = discoverBookability([open], [], [])
    expect(report.bookable).toBe(true)
    expect(report.missingSeriesEntityTypes).toEqual([])
  })
})

describe("explainBookability", () => {
  it("explains a fully bookable org", () => {
    const report = discoverBookability([open], [documentSeries, eventSeries])
    expect(explainBookability(report)).toBe(
      "This organization is bookable: it has an OPEN accounting period and a number series for " +
        "every required entity type (DOCUMENT, EVENT).",
    )
  })

  it("explains a missing period only", () => {
    const report = discoverBookability([], [documentSeries, eventSeries])
    expect(explainBookability(report)).toBe(
      "This organization is NOT bookable yet — it has no OPEN accounting period.",
    )
  })

  it("explains a missing series only", () => {
    const report = discoverBookability([open], [documentSeries])
    expect(explainBookability(report)).toBe(
      "This organization is NOT bookable yet — it is missing a number series for: EVENT.",
    )
  })

  it("explains both gaps together", () => {
    const report = discoverBookability([], [])
    expect(explainBookability(report)).toBe(
      "This organization is NOT bookable yet — it has no OPEN accounting period; and it is missing " +
        "a number series for: DOCUMENT, EVENT.",
    )
  })
})
