import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Spinner } from "./spinner"

describe("Spinner", () => {
  it("renders a status element", () => {
    render(<Spinner />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("has accessible loading label", () => {
    render(<Spinner />)
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
  })

  it("exposes its component slot", () => {
    render(<Spinner />)
    expect(screen.getByRole("status")).toHaveAttribute("data-slot", "spinner")
  })

  it("applies custom className", () => {
    render(<Spinner className="size-8" />)
    expect(screen.getByRole("status")).toHaveClass("size-8")
  })
})
