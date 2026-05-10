import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { LiquidMetalButton } from "./button-liquid-metal"

describe("LiquidMetalButton", () => {
  it("renders with text", () => {
    render(<LiquidMetalButton>Click me</LiquidMetalButton>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick handler", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<LiquidMetalButton onClick={onClick}>Click</LiquidMetalButton>)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when disabled prop is set", () => {
    render(<LiquidMetalButton disabled>Disabled</LiquidMetalButton>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("applies variant data attribute", () => {
    render(<LiquidMetalButton variant="destructive">Del</LiquidMetalButton>)
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "destructive",
    )
  })
})
