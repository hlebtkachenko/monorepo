import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Browser } from "./browser"

describe("Browser", () => {
  it("renders address bar with initial URL", () => {
    render(<Browser initialUrl="https://x.test" />)
    expect(screen.getByLabelText("Address bar")).toHaveValue("https://x.test")
  })

  it("shows window controls when enabled", () => {
    const { container } = render(<Browser showWindowControls />)
    const dots = container.querySelectorAll("span.size-3")
    expect(dots.length).toBe(3)
  })

  it("shows tabs when tab management enabled", () => {
    render(<Browser enableTabManagement />)
    expect(screen.getByRole("button", { name: "New tab" })).toBeInTheDocument()
  })

  it("creates a new tab", async () => {
    const user = userEvent.setup()
    render(<Browser enableTabManagement />)
    await user.click(screen.getByRole("button", { name: "New tab" }))
    expect(screen.getAllByText("New Tab").length).toBeGreaterThan(1)
  })

  it("toggles bookmark icon", async () => {
    const user = userEvent.setup()
    render(<Browser />)
    await user.click(screen.getByRole("button", { name: "Bookmark this page" }))
    expect(
      screen.getByRole("button", { name: "Remove bookmark" }),
    ).toBeInTheDocument()
  })

  it("hides status bar when disabled", () => {
    render(<Browser showStatusBar={false} />)
    expect(screen.queryByText(/Ready/)).not.toBeInTheDocument()
  })

  it("renders empty state on about:blank", () => {
    render(<Browser initialUrl="about:blank" />)
    expect(screen.getByText("New Tab")).toBeInTheDocument()
  })
})
