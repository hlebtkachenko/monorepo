import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { AnimatedShinyButton } from "./animated-shiny-button"

describe("AnimatedShinyButton", () => {
  it("renders with text", () => {
    render(<AnimatedShinyButton>Click me</AnimatedShinyButton>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick handler", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<AnimatedShinyButton onClick={onClick}>Click</AnimatedShinyButton>)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when disabled prop is set", () => {
    render(<AnimatedShinyButton disabled>Disabled</AnimatedShinyButton>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("sets custom highlight color via CSS variable", () => {
    render(
      <AnimatedShinyButton highlightColor="#ff0000">Red</AnimatedShinyButton>,
    )
    const button = screen.getByRole("button")
    expect(button.style.getPropertyValue("--shiny-highlight")).toBe("#ff0000")
  })
})
