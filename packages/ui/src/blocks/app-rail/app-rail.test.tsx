import { render as rtlRender, screen } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppRail } from "./app-rail"

// Wrap every render with IconProvider — AppRail calls useIcons()
// unconditionally and the hook throws outside a provider.
const render = ((ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<IconProvider>{ui}</IconProvider>)) as typeof rtlRender

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty("--shell-rail-width")
})

const items = [
  {
    key: "accounting",
    label: "Accounting",
    icon: <span data-testid="icon-accounting" />,
    active: true,
  },
  {
    key: "documents",
    label: "Documents",
    icon: <span data-testid="icon-documents" />,
    href: "/docs",
  },
  {
    key: "finance",
    label: "Finance",
    icon: <span data-testid="icon-finance" />,
  },
]

describe("AppRail", () => {
  it("renders all items in expanded mode with labels", () => {
    render(<AppRail items={items} defaultMode="expanded" />)
    expect(screen.getByText("Accounting")).toBeInTheDocument()
    expect(screen.getByText("Documents")).toBeInTheDocument()
    expect(screen.getByText("Finance")).toBeInTheDocument()
    expect(screen.getByTestId("icon-accounting")).toBeInTheDocument()
  })

  it("hides labels in icon-only mode (uses title attribute instead)", () => {
    render(<AppRail items={items} defaultMode="icon-only" />)
    expect(screen.queryByText("Accounting")).not.toBeInTheDocument()
    const link = screen
      .getByTestId("icon-accounting")
      .closest("a") as HTMLAnchorElement
    expect(link).toHaveAttribute("title", "Accounting")
    expect(link).toHaveAttribute("aria-label", "Accounting")
  })

  it("uses href when provided, otherwise '#'", () => {
    const { container } = render(
      <AppRail items={items} defaultMode="expanded" />,
    )
    const anchors = container.querySelectorAll("a")
    expect(anchors[0]).toHaveAttribute("href", "#")
    expect(anchors[1]).toHaveAttribute("href", "/docs")
  })

  it("marks the active item with data-active", () => {
    const { container } = render(
      <AppRail items={items} defaultMode="expanded" />,
    )
    const active = container.querySelectorAll("a[data-active]")
    expect(active.length).toBe(1)
    expect(active[0]).toHaveAttribute("href", "#")
  })

  it("writes the --shell-rail-width CSS var on document root", () => {
    render(<AppRail items={items} defaultMode="expanded" />)
    expect(
      document.documentElement.style.getPropertyValue("--shell-rail-width"),
    ).toBe("60px")
  })
})
