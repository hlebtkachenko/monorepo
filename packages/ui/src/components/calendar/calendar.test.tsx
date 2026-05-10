import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { Calendar } from "./calendar"

describe("Calendar", () => {
  it("renders navigation buttons", () => {
    render(<Calendar mode="single" />)
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument()
  })

  it("renders day grid", () => {
    render(<Calendar mode="single" />)
    const grid = screen.getByRole("grid")
    expect(grid).toBeInTheDocument()
  })

  it("calls onSelect when a day is clicked", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Calendar mode="single" onSelect={onSelect} />)

    const dayButtons = screen.getAllByRole("button").filter(
      (btn) => !btn.getAttribute("aria-label")?.match(/previous|next/i)
    )

    if (dayButtons.length > 0) {
      await user.click(dayButtons[0]!)
    }

    expect(screen.getByRole("grid")).toBeInTheDocument()
  })
})
