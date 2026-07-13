import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { GroupFrame, sectionGroup } from "./section-group"
import { sectionForm } from "./section-form"
import { isSectionDescriptor } from "./section"

describe("sectionGroup factory", () => {
  it("mints a branded `group` descriptor holding nested sections", () => {
    const descriptor = sectionGroup({
      title: "Company",
      sections: [sectionForm({ title: "Legal identity", fields: [] })],
    })
    expect(descriptor.kind).toBe("group")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.sections).toHaveLength(1)
  })

  it("lifts `anchor` onto the descriptor", () => {
    expect(sectionGroup({ sections: [], anchor: "company" }).anchor).toBe(
      "company",
    )
  })
})

describe("GroupFrame", () => {
  it("renders the title as an h2, top + bottom rules, and its children", () => {
    const { container } = render(
      <GroupFrame title="Company">
        <span>nested</span>
      </GroupFrame>,
    )
    expect(
      screen.getByRole("heading", { name: "Company", level: 2 }),
    ).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass("border-t", "border-b")
    expect(screen.getByText("nested")).toBeInTheDocument()
  })

  it("omits the heading when no title is given", () => {
    render(
      <GroupFrame>
        <span>nested</span>
      </GroupFrame>,
    )
    expect(screen.queryByRole("heading")).toBeNull()
  })
})
