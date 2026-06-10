import { render as rtlRender, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppHeader } from "./app-header"

// AppHeader resolves its search icon via useIcons(), so every render
// needs an IconProvider ancestor.
const render = ((ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<IconProvider>{ui}</IconProvider>)) as typeof rtlRender

describe("AppHeader", () => {
  it("renders the search input with the default placeholder", () => {
    render(<AppHeader />)
    const input = screen.getByRole("searchbox", { name: "Search" })
    expect(input).toHaveAttribute("placeholder", "Search…")
  })

  it("renders a custom search placeholder", () => {
    render(<AppHeader searchPlaceholder="Search documents…" />)
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute(
      "placeholder",
      "Search documents…",
    )
  })

  it("renders the actions slot content in the right zone", () => {
    render(<AppHeader actions={<button type="button">Action</button>} />)
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
  })

  it("merges className onto the root element", () => {
    const { container } = render(<AppHeader className="custom-class" />)
    const root = container.querySelector('[data-slot="app-header"]')
    expect(root).toHaveClass("custom-class")
  })
})
