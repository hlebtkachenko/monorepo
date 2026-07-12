import { describe, it, expect } from "vitest"

import { ArchetypeDescriptor, isArchetypeDescriptor } from "./archetype"
import { archetypeEmpty } from "./archetype-empty"

describe("archetype brand", () => {
  it("archetypeEmpty produces an authentically branded descriptor", () => {
    const descriptor = archetypeEmpty({ title: "Nothing here" })
    expect(isArchetypeDescriptor(descriptor)).toBe(true)
    expect(descriptor.kind).toBe("empty")
  })

  it("rejects a hand-built object that lacks the brand", () => {
    const forged = { kind: "empty", props: {} }
    expect(isArchetypeDescriptor(forged)).toBe(false)
  })

  it("rejects a descriptor whose kind is not in ARCHETYPE_KINDS", () => {
    const bogus = { kind: "bogus" } as unknown as ArchetypeDescriptor
    expect(isArchetypeDescriptor(bogus)).toBe(false)
  })
})
