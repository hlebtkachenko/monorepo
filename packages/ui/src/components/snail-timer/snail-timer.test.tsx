import { describe, expect, it, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { SnailTimer } from "./snail-timer"

describe("SnailTimer", () => {
  it("renders role=timer with seconds remaining", () => {
    render(<SnailTimer initialSeconds={10} />)
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "10 seconds remaining",
    )
  })

  it("counts down by one second", () => {
    vi.useFakeTimers()
    render(<SnailTimer initialSeconds={2} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "1 second remaining",
    )
    vi.useRealTimers()
  })

  it("singularizes 'second' at one remaining", () => {
    vi.useFakeTimers()
    render(<SnailTimer initialSeconds={2} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText("1 second remaining")).toBeInTheDocument()
    vi.useRealTimers()
  })
})
