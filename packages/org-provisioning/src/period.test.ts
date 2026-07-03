import { describe, expect, it } from "vitest"
import { derivePeriodBounds } from "./period"
import { ScaffoldValidationError } from "./errors"

describe("derivePeriodBounds", () => {
  it("new entity: datum vzniku → short first period to calendar FY end", () => {
    expect(
      derivePeriodBounds({
        entityKind: "NEW_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 1,
        registeredAt: "2026-03-15",
      }),
    ).toEqual({ periodStart: "2026-03-15", periodEnd: "2026-12-31" })
  })

  it("new entity: no datum vzniku → full fiscal year from fiscalYear", () => {
    expect(
      derivePeriodBounds({
        entityKind: "NEW_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 1,
        fiscalYear: 2026,
      }),
    ).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-12-31" })
  })

  it("migrated entity: conversion date → FY end", () => {
    expect(
      derivePeriodBounds({
        entityKind: "MIGRATED_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 1,
        periodStart: "2026-05-01",
      }),
    ).toEqual({ periodStart: "2026-05-01", periodEnd: "2026-12-31" })
  })

  it("non-calendar fiscal year (July start): registered mid-year ends at Jun 30", () => {
    expect(
      derivePeriodBounds({
        entityKind: "NEW_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 7,
        registeredAt: "2026-03-15",
      }),
    ).toEqual({ periodStart: "2026-03-15", periodEnd: "2026-06-30" })
  })

  it("TAX_RECORDS forces the calendar year regardless of fiscalYearStartMonth", () => {
    expect(
      derivePeriodBounds({
        entityKind: "NEW_ENTITY",
        regime: "TAX_RECORDS",
        fiscalYearStartMonth: 7,
        registeredAt: "2026-03-15",
      }),
    ).toEqual({ periodStart: "2026-03-15", periodEnd: "2026-12-31" })
  })

  it("explicit bounds pass through verbatim (§3/4 escape hatch)", () => {
    expect(
      derivePeriodBounds({
        entityKind: "NEW_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 1,
        periodStart: "2025-11-01",
        periodEnd: "2026-12-31",
      }),
    ).toEqual({ periodStart: "2025-11-01", periodEnd: "2026-12-31" })
  })

  it("throws when a migrated entity has no conversion date", () => {
    expect(() =>
      derivePeriodBounds({
        entityKind: "MIGRATED_ENTITY",
        regime: "DOUBLE_ENTRY",
        fiscalYearStartMonth: 1,
      }),
    ).toThrow(ScaffoldValidationError)
  })
})
