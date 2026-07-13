import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { DetailsGroupFrame, sectionDetailsGroup } from "./section-details-group"
import { sectionDetailsForm } from "./section-details-form"
import { isSectionDescriptor } from "./section"

describe("sectionDetailsGroup factory", () => {
  it("mints a branded `details-group` descriptor holding nested sections", () => {
    const descriptor = sectionDetailsGroup({
      title: "Company",
      sections: [sectionDetailsForm({ title: "Legal identity", fields: [] })],
    })
    expect(descriptor.kind).toBe("details-group")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.sections).toHaveLength(1)
  })

  it("lifts `anchor` onto the descriptor", () => {
    expect(
      sectionDetailsGroup({ sections: [], anchor: "company" }).anchor,
    ).toBe("company")
  })
})

describe("DetailsGroupFrame", () => {
  it("renders the title as an h2, top + bottom rules, and its children", () => {
    const { container } = render(
      <DetailsGroupFrame title="Company">
        <span>nested</span>
      </DetailsGroupFrame>,
    )
    expect(
      screen.getByRole("heading", { name: "Company", level: 2 }),
    ).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass("border-t", "border-b")
    expect(screen.getByText("nested")).toBeInTheDocument()
  })

  it("omits the heading when no title is given", () => {
    render(
      <DetailsGroupFrame>
        <span>nested</span>
      </DetailsGroupFrame>,
    )
    expect(screen.queryByRole("heading")).toBeNull()
  })
})
