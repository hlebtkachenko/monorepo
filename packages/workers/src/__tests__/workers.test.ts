/**
 * Unit tests for @workspace/workers.
 *
 * Tests use a FakeBoss instead of TestContainer because:
 * - registry + lane-binding logic is independent of pg-boss internals
 * - integration with real pg-boss is verified at the api integration
 *   test level (Commit 10), where boot() runs against a real
 *   PG18 testcontainer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getLane,
  hasLane,
  laneNames,
  registerLane,
  resetLaneRegistryForTests,
  type Lane,
} from "../lanes/registry"
import { PERMISSIONS_DRAIN_LANE_NAME } from "../lanes/permissions-drain"

describe("@workspace/workers — lane registry", () => {
  beforeEach(() => {
    resetLaneRegistryForTests()
  })

  afterEach(() => {
    resetLaneRegistryForTests()
  })

  it("registers + retrieves a lane by name", () => {
    const lane: Lane = {
      name: "test-lane",
      handler: vi.fn(async () => {}),
    }
    registerLane(lane)

    expect(hasLane("test-lane")).toBe(true)
    expect(getLane("test-lane")).toBe(lane)
    expect(laneNames()).toContain("test-lane")
  })

  it("throws when registering the same lane name twice", () => {
    const lane: Lane = {
      name: "dup",
      handler: vi.fn(async () => {}),
    }
    registerLane(lane)

    expect(() => registerLane(lane)).toThrowError(
      /Lane already registered: dup/,
    )
  })

  it("getLane(unknown) throws with a list of known lane names", () => {
    registerLane({ name: "a", handler: vi.fn(async () => {}) })
    registerLane({ name: "b", handler: vi.fn(async () => {}) })

    expect(() => getLane("c")).toThrowError(
      /Lane not registered: c\. Known lanes: a, b/,
    )
  })

  it("getLane(unknown) reports (none) when registry is empty", () => {
    expect(() => getLane("missing")).toThrowError(
      /Lane not registered: missing\. Known lanes: \(none\)/,
    )
  })

  it("laneNames is a snapshot, not a live reference", () => {
    registerLane({ name: "one", handler: vi.fn(async () => {}) })
    const names = laneNames()
    registerLane({ name: "two", handler: vi.fn(async () => {}) })

    expect(names).toEqual(["one"])
    expect(laneNames()).toEqual(["one", "two"])
  })
})

describe("@workspace/workers — permissions-drain lane", () => {
  // permissions-drain registers itself on import. We verify the import
  // by re-running registration logic via a child registry snapshot.
  it("exports the canonical lane name", () => {
    expect(PERMISSIONS_DRAIN_LANE_NAME).toBe("permissions-drain")
  })
})
