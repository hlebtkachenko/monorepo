import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DatePicker } from "./date-picker"

describe("DatePicker", () => {
  it("renders a calendar grid", () => {
    render(<DatePicker />)
    expect(screen.getByRole("grid")).toBeInTheDocument()
  })

  it("renders the default preset footer", () => {
    render(<DatePicker />)
    for (const label of [
      "Today",
      "Tomorrow",
      "In 3 days",
      "In a week",
      "In 2 weeks",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
    }
  })

  it("hides the footer when presets is empty", () => {
    render(<DatePicker presets={[]} />)
    expect(
      screen.queryByRole("button", { name: "Today" }),
    ).not.toBeInTheDocument()
  })

  it("fires onValueChange with today when the Today preset is clicked", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<DatePicker onValueChange={onValueChange} />)

    await user.click(screen.getByRole("button", { name: "Today" }))

    expect(onValueChange).toHaveBeenCalledTimes(1)
    const picked = onValueChange.mock.calls[0]?.[0] as Date
    const today = new Date()
    expect(picked.getFullYear()).toBe(today.getFullYear())
    expect(picked.getMonth()).toBe(today.getMonth())
    expect(picked.getDate()).toBe(today.getDate())
  })

  it("marks the active preset as pressed after it is clicked", async () => {
    const user = userEvent.setup()
    render(<DatePicker />)
    const today = screen.getByRole("button", { name: "Today" })
    expect(today).toHaveAttribute("aria-pressed", "false")

    await user.click(today)

    expect(today).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Tomorrow" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("renders calendar and presets in the horizontal orientation", () => {
    render(<DatePicker orientation="horizontal" />)
    expect(screen.getByRole("grid")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument()
  })
})
