import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ThemeToggle } from "./theme-toggle"

describe("ThemeToggle", () => {
  it("renders toggle buttons", () => {
    render(<ThemeToggle />)
    const buttons = screen.getAllByRole("button")
    expect(buttons.length).toBe(3)
  })
})
