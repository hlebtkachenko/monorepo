import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { SidebarInsight } from "./sidebar-insight"

describe("SidebarInsight", () => {
  it("renders the card when there is content", () => {
    const { container } = render(
      <SidebarInsight>
        <p>Promo</p>
      </SidebarInsight>,
    )
    expect(
      container.querySelector("[data-slot='sidebar-insight']"),
    ).toBeTruthy()
  })

  it("renders nothing when no content is passed", () => {
    const { container } = render(<SidebarInsight />)
    expect(container.querySelector("[data-slot='sidebar-insight']")).toBeNull()
  })

  it("renders nothing for empty content", () => {
    const { container } = render(<SidebarInsight>{null}</SidebarInsight>)
    expect(container.querySelector("[data-slot='sidebar-insight']")).toBeNull()
  })
})
