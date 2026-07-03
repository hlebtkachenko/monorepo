import { describe, expect, it } from "vitest"

import {
  ADVISOR_VERDICT_KINDS,
  BRAIN_RUN_ITEM_DECISIONS,
  BRAIN_RUN_STAGES,
  BRAIN_RUN_STATUSES,
  isBrainRunItemDecision,
  isBrainRunStatus,
} from "./types"

describe("brain run lifecycle constants", () => {
  it("exposes the six brain_run statuses incl. the master-gate awaiting_review", () => {
    expect(BRAIN_RUN_STATUSES).toContain("awaiting_review")
    expect(BRAIN_RUN_STATUSES).toHaveLength(6)
  })

  it("exposes the nine stage checkpoints 0-8", () => {
    expect([...BRAIN_RUN_STAGES]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it("exposes the six item decisions", () => {
    expect(BRAIN_RUN_ITEM_DECISIONS).toContain("deferred")
    expect(BRAIN_RUN_ITEM_DECISIONS).toHaveLength(6)
  })

  it("exposes the two advisor verdict kinds", () => {
    expect([...ADVISOR_VERDICT_KINDS]).toEqual(["resolve", "confirm"])
  })
})

describe("boundary guards", () => {
  it("accepts only real statuses", () => {
    expect(isBrainRunStatus("committed")).toBe(true)
    expect(isBrainRunStatus("bogus")).toBe(false)
    expect(isBrainRunStatus(7)).toBe(false)
    expect(isBrainRunStatus(null)).toBe(false)
  })

  it("accepts only real item decisions", () => {
    expect(isBrainRunItemDecision("review")).toBe(true)
    expect(isBrainRunItemDecision("")).toBe(false)
    expect(isBrainRunItemDecision(undefined)).toBe(false)
  })
})
