import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { BorderBeamButton, BorderBeamIconButton } from "./button-border-beam"

describe("BorderBeamButton", () => {
  it("renders with text", () => {
    render(<BorderBeamButton>Click me</BorderBeamButton>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick handler", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<BorderBeamButton onClick={onClick}>Click</BorderBeamButton>)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when disabled prop is set", () => {
    render(<BorderBeamButton disabled>Disabled</BorderBeamButton>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("passes variant to inner Button", () => {
    render(<BorderBeamButton variant="destructive">Delete</BorderBeamButton>)
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "destructive",
    )
  })
})

describe("BorderBeamIconButton", () => {
  it("renders", () => {
    render(<BorderBeamIconButton aria-label="Add">+</BorderBeamIconButton>)
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument()
  })
})
