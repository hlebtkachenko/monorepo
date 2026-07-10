import { describe, expect, it } from "vitest"
import {
  BRAIN_DEFAULT_MODEL,
  BRAIN_RECURRING_MODEL,
  selectBrainModel,
  type BookingTemplateMatch,
} from "./model-routing"

describe("selectBrainModel (M2.1 routing)", () => {
  it("routes a matched (confirmed, recurring) case to the cheap model", () => {
    const match: BookingTemplateMatch = { matched: true }
    expect(selectBrainModel(match)).toBe("haiku")
    expect(selectBrainModel(match)).toBe(BRAIN_RECURRING_MODEL)
  })

  it("escalates a novel/unmatched case to the stronger default model", () => {
    const match: BookingTemplateMatch = { matched: false }
    expect(selectBrainModel(match)).toBe("sonnet")
    expect(selectBrainModel(match)).toBe(BRAIN_DEFAULT_MODEL)
  })

  it("is pure/deterministic: identical input always yields identical output", () => {
    const match: BookingTemplateMatch = { matched: true }
    const results = Array.from({ length: 5 }, () => selectBrainModel(match))
    expect(new Set(results).size).toBe(1)
  })
})
