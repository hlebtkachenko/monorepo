import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { sectionTitle, SectionTitleRenderer } from "./section-title"
import { isSectionDescriptor } from "./section"

describe("sectionTitle factory", () => {
  it("mints a branded `title` descriptor the guard accepts", () => {
    const descriptor = sectionTitle({ title: "Company" })
    expect(descriptor.kind).toBe("title")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.title).toBe("Company")
  })

  it("lifts `anchor` onto the descriptor", () => {
    const descriptor = sectionTitle({ title: "Company", anchor: "company" })
    expect(descriptor.anchor).toBe("company")
  })
})

describe("SectionTitleRenderer", () => {
  it("renders the title as an h2", () => {
    render(<SectionTitleRenderer props={{ title: "Company" }} />)
    const heading = screen.getByRole("heading", { name: "Company" })
    expect(heading.tagName).toBe("H2")
  })
})
