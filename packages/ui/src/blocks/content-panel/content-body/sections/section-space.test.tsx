import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { sectionSpace, SectionSpaceRenderer } from "./section-space"
import { isSectionDescriptor } from "./section"

describe("sectionSpace factory", () => {
  it("mints a branded `space` descriptor with the default size", () => {
    const descriptor = sectionSpace()
    expect(descriptor.kind).toBe("space")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.size).toBe(16)
    expect(descriptor.fill).toBeFalsy()
  })

  it("honours a per-page size and anchor", () => {
    const descriptor = sectionSpace({ size: 40, anchor: "gap" })
    expect(descriptor.props.size).toBe(40)
    expect(descriptor.anchor).toBe("gap")
  })
})

describe("SectionSpaceRenderer", () => {
  it("reserves the requested height and is decorative", () => {
    const { container } = render(<SectionSpaceRenderer props={{ size: 24 }} />)
    const spacer = container.firstElementChild as HTMLElement
    expect(spacer).toHaveStyle({ height: "24px" })
    expect(spacer).toHaveAttribute("aria-hidden")
  })
})
