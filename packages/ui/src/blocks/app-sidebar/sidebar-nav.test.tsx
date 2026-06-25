import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SidebarNav, type SidebarNavEntry } from "./sidebar-nav"

const ENTRIES: SidebarNavEntry[] = [
  { label: "Overview", href: "/acme", icon: "Goal" },
  { label: "Tasks", href: "/acme/tasks", icon: "Calculator", badge: 3 },
  {
    label: "Automations",
    href: "/acme/automations",
    icon: "Workflow",
    subpages: [
      { label: "Sequences", href: "/acme/automations/sequences" },
      { label: "Workflows", href: "/acme/automations/workflows" },
    ],
  },
  {
    label: "Filings",
    pages: [
      { label: "VAT returns", href: "/acme/vat", icon: "FileText" },
      { label: "Control statement", href: "/acme/control", icon: "FileText" },
    ],
  },
]

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("SidebarNav", () => {
  it("renders a labelled Module nav landmark", () => {
    wrap(<SidebarNav entries={ENTRIES} />)
    expect(
      screen.getByRole("navigation", { name: /module/i }),
    ).toBeInTheDocument()
  })

  it("marks the longest-prefix match active via aria-current", () => {
    wrap(<SidebarNav entries={ENTRIES} currentPath="/acme/vat/123" />)
    expect(screen.getByRole("link", { name: /vat returns/i })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: /overview/i })).not.toHaveAttribute(
      "aria-current",
    )
  })

  it("associates a group with its label and renders badges", () => {
    const { container } = wrap(<SidebarNav entries={ENTRIES} />)
    expect(screen.getByText("3")).toBeInTheDocument()
    const group = container.querySelector("[role='group']")
    const labelId = group?.getAttribute("aria-labelledby")
    expect(labelId).toBeTruthy()
    expect(container.querySelector(`#${labelId}`)?.textContent).toBe("Filings")
  })

  it("shows a collapse/expand toggle on a page with subpages", () => {
    wrap(<SidebarNav entries={ENTRIES} currentPath="/acme" />)
    expect(
      screen.getByRole("button", { name: /expand|collapse/i }),
    ).toBeInTheDocument()
  })

  it("auto-expands a page when one of its subpages is active", () => {
    wrap(
      <SidebarNav
        entries={ENTRIES}
        currentPath="/acme/automations/sequences"
      />,
    )
    expect(screen.getByRole("link", { name: /sequences/i })).toHaveAttribute(
      "aria-current",
      "page",
    )
    // The parent page link is present but NOT the active row.
    expect(
      screen.getByRole("link", { name: /^automations$/i }),
    ).not.toHaveAttribute("aria-current")
  })
})
