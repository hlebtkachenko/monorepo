import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { sectionDivider, SectionDividerRenderer } from "./section-divider"
import { isSectionDescriptor } from "./section"

describe("sectionDivider factory", () => {
  it("mints a branded `divider` descriptor the guard accepts", () => {
    const descriptor = sectionDivider()
    expect(descriptor.kind).toBe("divider")
    expect(isSectionDescriptor(descriptor)).toBe(true)
  })

  it("lifts `anchor` onto the descriptor", () => {
    expect(sectionDivider({ anchor: "rule" }).anchor).toBe("rule")
  })
})

describe("SectionDividerRenderer", () => {
  it("renders a decorative full-width hairline", () => {
    const { container } = render(<SectionDividerRenderer props={{}} />)
    const rule = container.firstElementChild as HTMLElement
    expect(rule).toHaveClass("border-t")
    expect(rule).toHaveAttribute("aria-hidden")
  })
})
