import { describe, it, expect } from "vitest"

import { SectionDescriptor, isSectionDescriptor } from "./section"
import { sectionEmpty } from "./section-empty"

describe("section brand", () => {
  it("sectionEmpty produces an authentically branded descriptor", () => {
    const descriptor = sectionEmpty({ title: "Placeholder" })
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.kind).toBe("empty")
  })

  it("sectionEmpty defaults its props when called without arguments", () => {
    const descriptor = sectionEmpty()
    expect(isSectionDescriptor(descriptor)).toBe(true)
  })

  it("rejects a hand-built object that lacks the brand", () => {
    const forged = { kind: "empty", props: {} }
    expect(isSectionDescriptor(forged)).toBe(false)
  })

  it("rejects a descriptor whose kind is not in SECTION_KINDS", () => {
    const bogus = { kind: "bogus" } as unknown as SectionDescriptor
    expect(isSectionDescriptor(bogus)).toBe(false)
  })
})
