import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ThemeProvider } from "./theme-provider"

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    )
    expect(screen.getByText("Content")).toBeInTheDocument()
  })
})
