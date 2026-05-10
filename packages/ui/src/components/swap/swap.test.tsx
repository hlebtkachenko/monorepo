import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { Swap, SwapOn, SwapOff } from "./swap"

describe("Swap", () => {
  it("renders with off state by default", () => {
    render(
      <Swap>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "off")
  })

  it("toggles state on click", async () => {
    const user = userEvent.setup()
    render(
      <Swap>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    const button = screen.getByRole("button")
    await user.click(button)
    expect(button).toHaveAttribute("data-state", "on")
  })

  it("calls onSwappedChange when toggled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Swap onSwappedChange={onChange}>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    await user.click(screen.getByRole("button"))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("respects defaultSwapped prop", () => {
    render(
      <Swap defaultSwapped>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "on")
  })

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup()
    render(
      <Swap disabled>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    const button = screen.getByRole("button")
    await user.click(button)
    expect(button).toHaveAttribute("data-state", "off")
  })

  it("sets animation data attribute", () => {
    render(
      <Swap animation="rotate">
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-animation",
      "rotate",
    )
  })

  it("toggles with keyboard Enter", async () => {
    const user = userEvent.setup()
    render(
      <Swap>
        <SwapOff>Off</SwapOff>
        <SwapOn>On</SwapOn>
      </Swap>,
    )
    const button = screen.getByRole("button")
    button.focus()
    await user.keyboard("{Enter}")
    expect(button).toHaveAttribute("data-state", "on")
  })
})
