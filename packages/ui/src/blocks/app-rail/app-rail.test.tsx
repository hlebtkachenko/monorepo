import { render as rtlRender, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppRail, type RailMenuEntry } from "./app-rail"

// AppRail resolves icons via useIcons(), so every render needs an
// IconProvider ancestor.
const render = ((ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<IconProvider>{ui}</IconProvider>)) as typeof rtlRender

const items: RailMenuEntry[] = [
  { label: "Company", icon: "Goal", href: "/acme" },
  "separator",
  { label: "Accounting", icon: "SwatchBook", href: "/acme/accounting" },
  { label: "Finance", icon: "PiggyBank", href: "/acme/finance" },
]

describe("AppRail", () => {
  // The mode effect persists to localStorage; clear it so each test's
  // `defaultMode` isn't overridden by a prior test's stored value.
  afterEach(() => localStorage.clear())

  it("renders labels in expanded mode", () => {
    render(<AppRail items={items} defaultMode="expanded" />)
    expect(screen.getByText("Company")).toBeInTheDocument()
    expect(screen.getByText("Accounting")).toBeInTheDocument()
  })

  it("renders a divider for each separator entry", () => {
    render(<AppRail items={items} defaultMode="expanded" />)
    expect(screen.getAllByRole("separator")).toHaveLength(1)
  })

  it("marks the longest-prefix match active (deep route)", () => {
    render(
      <AppRail
        items={items}
        defaultMode="expanded"
        currentPath="/acme/finance/123"
      />,
    )
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute(
      "data-active",
      "true",
    )
    // Index item must NOT win when on a deeper route.
    expect(screen.getByRole("link", { name: "Company" })).not.toHaveAttribute(
      "data-active",
    )
  })

  it("activates the index item only on the exact root path", () => {
    render(<AppRail items={items} defaultMode="expanded" currentPath="/acme" />)
    expect(screen.getByRole("link", { name: "Company" })).toHaveAttribute(
      "data-active",
      "true",
    )
    expect(
      screen.getByRole("link", { name: "Accounting" }),
    ).not.toHaveAttribute("data-active")
  })

  it("hides labels in icon-only mode; name via aria-label, no title", () => {
    render(<AppRail items={items} defaultMode="icon-only" />)
    expect(screen.queryByText("Accounting")).not.toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Accounting" })
    expect(link).not.toHaveAttribute("title")
  })

  it("falls back to '#' when an item has no href", () => {
    render(
      <AppRail
        items={[{ label: "Nolink", icon: "Goal" }]}
        defaultMode="expanded"
      />,
    )
    expect(screen.getByRole("link", { name: "Nolink" })).toHaveAttribute(
      "href",
      "#",
    )
  })
})
