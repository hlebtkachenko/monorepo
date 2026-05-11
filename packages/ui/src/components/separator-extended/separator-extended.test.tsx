import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { SeparatorExtended } from "./separator-extended"

describe("SeparatorExtended", () => {
  it("renders with solid variant by default", () => {
    const { container } = render(<SeparatorExtended />)
    const el = container.querySelector("[data-slot='separator-extended']")
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute("data-variant", "solid")
    expect(el?.className).toContain("border-solid")
  })

  it("applies dashed variant classes", () => {
    const { container } = render(<SeparatorExtended variant="dashed" />)
    const el = container.querySelector("[data-slot='separator-extended']")
    expect(el).toHaveAttribute("data-variant", "dashed")
    expect(el?.className).toContain("border-dashed")
  })

  it("applies dotted variant classes", () => {
    const { container } = render(<SeparatorExtended variant="dotted" />)
    const el = container.querySelector("[data-slot='separator-extended']")
    expect(el).toHaveAttribute("data-variant", "dotted")
    expect(el?.className).toContain("border-dotted")
  })

  it("applies double variant classes", () => {
    const { container } = render(<SeparatorExtended variant="double" />)
    const el = container.querySelector("[data-slot='separator-extended']")
    expect(el).toHaveAttribute("data-variant", "double")
    expect(el?.className).toContain("border-double")
  })

  it("supports vertical orientation", () => {
    const { container } = render(
      <SeparatorExtended orientation="vertical" variant="dashed" />,
    )
    const el = container.querySelector("[data-slot='separator-extended']")
    expect(el).toHaveAttribute("data-orientation", "vertical")
  })
})
