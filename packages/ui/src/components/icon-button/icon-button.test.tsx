import { render as rtlRender, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { IconButton } from "./icon-button"

// IconButton resolves its glyph via useIcons(), so every render needs an
// IconProvider ancestor.
const render = ((ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<IconProvider>{ui}</IconProvider>)) as typeof rtlRender

describe("IconButton", () => {
  it("renders icon-only as a button; name from a string tooltip", () => {
    render(<IconButton icon="Inbox" tooltip="Inbox" />)
    expect(screen.getByRole("button", { name: "Inbox" })).toBeInTheDocument()
  })

  it("shows the label text in the labeled variant", () => {
    render(<IconButton icon="Goal" label="Company" />)
    expect(screen.getByText("Company")).toBeInTheDocument()
  })

  it("marks the active state via data-active", () => {
    render(<IconButton icon="Goal" label="Company" active />)
    expect(screen.getByRole("button", { name: "Company" })).toHaveAttribute(
      "data-active",
      "true",
    )
  })

  it("renders an anchor when href is set", () => {
    render(<IconButton icon="Goal" label="Company" href="/x" />)
    expect(screen.getByRole("link", { name: "Company" })).toHaveAttribute(
      "href",
      "/x",
    )
  })

  it("disables the button", () => {
    render(<IconButton icon="Goal" label="Company" disabled />)
    expect(screen.getByRole("button", { name: "Company" })).toBeDisabled()
  })
})
