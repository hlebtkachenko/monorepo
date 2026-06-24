import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SidebarReminders, type SidebarReminder } from "./sidebar-reminders"

const REMINDERS: SidebarReminder[] = [
  {
    id: "a1",
    kind: "action",
    title: "VAT return due",
    description: "Due in 3 days.",
    actionLabel: "File",
  },
  { id: "i1", kind: "info", title: "Heads up" },
]

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("SidebarReminders", () => {
  beforeEach(() => window.localStorage.clear())

  it("renders nothing when the system sent no reminders", () => {
    const { container } = wrap(
      <SidebarReminders reminders={[]} storageKey="t" />,
    )
    expect(
      container.querySelector("[data-slot='sidebar-reminders']"),
    ).toBeNull()
  })

  it("shows active reminders in both styles", () => {
    wrap(<SidebarReminders reminders={REMINDERS} storageKey="t" />)
    expect(screen.getByText("VAT return due")).toBeInTheDocument()
    expect(screen.getByText("Heads up")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /file/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument()
  })

  it("closes a reminder when its action is done and persists that", () => {
    const { unmount } = wrap(
      <SidebarReminders reminders={REMINDERS} storageKey="t" />,
    )
    fireEvent.click(screen.getByRole("button", { name: /file/i }))
    // Closed immediately.
    expect(screen.queryByText("VAT return due")).toBeNull()
    // Persisted to localStorage.
    const raw = window.localStorage.getItem("sidebar-reminders-dismissed:t")
    expect(JSON.parse(raw ?? "[]")).toContain("a1")
    // Remount (simulates reload) — the resolved reminder does NOT come back,
    // while the untouched one still shows.
    unmount()
    wrap(<SidebarReminders reminders={REMINDERS} storageKey="t" />)
    expect(screen.queryByText("VAT return due")).toBeNull()
    expect(screen.getByText("Heads up")).toBeInTheDocument()
  })

  it("collapses to nothing once every reminder is resolved", () => {
    const { container } = wrap(
      <SidebarReminders reminders={REMINDERS} storageKey="t" />,
    )
    fireEvent.click(screen.getByRole("button", { name: /file/i }))
    fireEvent.click(screen.getByRole("button", { name: /open/i }))
    expect(
      container.querySelector("[data-slot='sidebar-reminders']"),
    ).toBeNull()
  })

  it("scopes dismissals by storageKey (per org)", () => {
    const { unmount } = wrap(
      <SidebarReminders reminders={REMINDERS} storageKey="orgA" />,
    )
    fireEvent.click(screen.getByRole("button", { name: /file/i }))
    unmount()
    // A different org has its own dismissed-set — reminder still shows.
    wrap(<SidebarReminders reminders={REMINDERS} storageKey="orgB" />)
    expect(screen.getByText("VAT return due")).toBeInTheDocument()
  })
})
