import { describe, expect, it } from "vitest"

import { resolveHeaderFilterTarget } from "./archetype-table"

describe("resolveHeaderFilterTarget", () => {
  const filterCols = ["document", "partner", "amount"]

  it("preselects a column the multi-filter owns", () => {
    expect(resolveHeaderFilterTarget("partner", filterCols, "status")).toEqual({
      property: "partner",
      routeToStatus: false,
    })
  })

  it("routes the statusFilter-delegated column to the faceted control", () => {
    // Regression: passing "status" (not in the multi-filter) as `property` threw
    // in FilterSelector.getColumn — it must route to the status filter instead.
    expect(resolveHeaderFilterTarget("status", filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: true,
    })
  })

  it("never yields an unknown property for a column in neither control", () => {
    expect(resolveHeaderFilterTarget("mystery", filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })

  it("is inert with no request", () => {
    expect(resolveHeaderFilterTarget(undefined, filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })

  it("does not route to status when no statusFilter columnId is set", () => {
    expect(resolveHeaderFilterTarget("status", filterCols, undefined)).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })
})
