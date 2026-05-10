import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { LiquidMetalButton } from "./liquid-metal-button"

describe("LiquidMetalButton", () => {
  it("renders with label", () => {
    render(<LiquidMetalButton label="Click me" />)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("renders with default label", () => {
    render(<LiquidMetalButton />)
    expect(
      screen.getByRole("button", { name: "Get Started" }),
    ).toBeInTheDocument()
  })

  it("calls onClick handler", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<LiquidMetalButton onClick={onClick} />)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when disabled prop is set", () => {
    render(<LiquidMetalButton disabled />)
    expect(screen.getByRole("button")).toBeDisabled()
  })
})
