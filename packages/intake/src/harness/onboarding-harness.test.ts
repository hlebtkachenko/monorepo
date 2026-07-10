import { describe, expect, it } from "vitest"

import type { NumberSeriesLike, PeriodLike } from "@workspace/brain"
import {
  ONBOARDING_DEFAULT_NUMBER_SERIES,
  planOnboarding,
} from "./onboarding-harness"

const open: PeriodLike = { status: "OPEN" }
const closed: PeriodLike = { status: "CLOSED" }
const documentSeries: NumberSeriesLike = { entityType: "DOCUMENT" }
const eventSeries: NumberSeriesLike = { entityType: "EVENT" }
const TODAY = "2026-07-10"

describe("planOnboarding", () => {
  it("proposes nothing for an already-bookable org", () => {
    const plan = planOnboarding({
      periods: [open],
      series: [documentSeries, eventSeries],
      today: TODAY,
    })
    expect(plan.report.bookable).toBe(true)
    expect(plan.proposedCalls).toEqual([])
    expect(plan.explanation).toMatch(/^This organization is bookable/)
  })

  it("proposes ONE create_accounting_period call when no period exists — never a series call too", () => {
    const plan = planOnboarding({
      periods: [],
      series: [],
      today: TODAY,
    })
    expect(plan.report.bookable).toBe(false)
    expect(plan.proposedCalls).toHaveLength(1)
    expect(plan.proposedCalls[0]).toEqual({
      tool: "create_accounting_period",
      purpose: expect.stringContaining("No OPEN accounting period"),
      request: { periodStart: TODAY },
    })
  })

  it("proposes create_accounting_period even when a period exists but is CLOSED", () => {
    const plan = planOnboarding({
      periods: [closed],
      series: [documentSeries, eventSeries],
      today: TODAY,
    })
    expect(plan.proposedCalls).toHaveLength(1)
    expect(plan.proposedCalls[0]?.tool).toBe("create_accounting_period")
  })

  it("proposes create_number_series calls for each missing entity type when a period IS open", () => {
    const plan = planOnboarding({
      periods: [open],
      series: [],
      today: TODAY,
    })
    expect(plan.report.hasOpenPeriod).toBe(true)
    expect(plan.report.missingSeriesEntityTypes).toEqual(["DOCUMENT", "EVENT"])
    // One proposed call per DOCUMENT default (FV/FP/PD/BV/ID) + one EVENT default (UC).
    const documentDefaults = ONBOARDING_DEFAULT_NUMBER_SERIES.filter(
      (s) => s.entityType === "DOCUMENT",
    )
    const eventDefaults = ONBOARDING_DEFAULT_NUMBER_SERIES.filter(
      (s) => s.entityType === "EVENT",
    )
    expect(plan.proposedCalls).toHaveLength(
      documentDefaults.length + eventDefaults.length,
    )
    expect(
      plan.proposedCalls.every((c) => c.tool === "create_number_series"),
    ).toBe(true)
    // Every proposed request is a verbatim canonical default — never an invented code/pattern.
    for (const call of plan.proposedCalls) {
      expect(ONBOARDING_DEFAULT_NUMBER_SERIES).toContainEqual(call.request)
    }
  })

  it("proposes only the missing entity type's defaults when just one series type is present", () => {
    const plan = planOnboarding({
      periods: [open],
      series: [documentSeries],
      today: TODAY,
    })
    expect(plan.report.missingSeriesEntityTypes).toEqual(["EVENT"])
    expect(plan.proposedCalls).toHaveLength(1)
    expect(plan.proposedCalls[0]).toEqual({
      tool: "create_number_series",
      purpose: expect.stringContaining("create_accounting_event"),
      request: { entityType: "EVENT", code: "UC", pattern: "UC{YYYY}{NNNNNN}" },
    })
  })

  it("honors a narrower requiredEntityTypes override end to end", () => {
    const plan = planOnboarding({
      periods: [open],
      series: [],
      today: TODAY,
      requiredEntityTypes: ["DOCUMENT"],
    })
    expect(plan.report.missingSeriesEntityTypes).toEqual(["DOCUMENT"])
    expect(
      plan.proposedCalls.every((c) => c.tool === "create_number_series"),
    ).toBe(true)
    expect(plan.proposedCalls).toHaveLength(5)
  })
})
