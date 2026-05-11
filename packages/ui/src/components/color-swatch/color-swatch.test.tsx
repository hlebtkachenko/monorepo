import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ColorSwatch } from "./color-swatch"

describe("ColorSwatch", () => {
  it("renders aria-label with provided color", () => {
    render(<ColorSwatch color="#ff0000" />)
    expect(
      screen.getByRole("img", { name: "Color swatch: #ff0000" }),
    ).toBeInTheDocument()
  })

  it("renders fallback aria-label when no color", () => {
    render(<ColorSwatch />)
    expect(
      screen.getByRole("img", { name: "No color selected" }),
    ).toBeInTheDocument()
  })

  it("applies size variant classes", () => {
    render(<ColorSwatch color="#0f0" size="lg" />)
    expect(screen.getByRole("img").className).toContain("size-12")
  })

  it("marks disabled via aria-disabled", () => {
    render(<ColorSwatch color="#0f0" disabled />)
    expect(screen.getByRole("img")).toHaveAttribute("aria-disabled", "true")
  })

  it("paints solid color as backgroundColor", () => {
    render(<ColorSwatch color="#abcdef" withoutTransparency />)
    expect(screen.getByRole("img").style.backgroundColor).toBe(
      "rgb(171, 205, 239)",
    )
  })
})
