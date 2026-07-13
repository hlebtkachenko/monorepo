import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { Button, buttonVariants } from "./button"

describe("Button", () => {
  it("renders", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick handler", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("applies variant data attribute", () => {
    render(<Button variant="destructive">Del</Button>)
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "destructive",
    )
  })

  it("buttonVariants returns expected classes for outline", () => {
    const cls = buttonVariants({ variant: "outline" })
    expect(cls).toContain("border-border")
  })

  it("applies the default hover treatment to buttons and links", () => {
    expect(buttonVariants()).toContain("hover:bg-primary/80")
    expect(buttonVariants()).not.toContain("[a]:hover:bg-primary/80")
  })
})
