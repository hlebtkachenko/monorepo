import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Text, textVariants } from "./text"

describe("Text", () => {
  it("renders as p by default", () => {
    const { container } = render(<Text>Hello</Text>)
    expect(container.querySelector("p")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("renders blockquote element for blockquote variant", () => {
    const { container } = render(<Text variant="blockquote">Quote</Text>)
    expect(container.querySelector("blockquote")).toBeInTheDocument()
  })

  it("renders code element for inline-code variant", () => {
    const { container } = render(<Text variant="inline-code">code</Text>)
    expect(container.querySelector("code")).toBeInTheDocument()
  })

  it("renders figcaption for caption variant", () => {
    const { container } = render(<Text variant="caption">Fig 1</Text>)
    expect(container.querySelector("figcaption")).toBeInTheDocument()
  })

  it("renders span for overline variant", () => {
    const { container } = render(<Text variant="overline">Section</Text>)
    expect(container.querySelector("span")).toBeInTheDocument()
    expect(screen.getByText("Section").className).toContain("uppercase")
  })

  it("applies variant-specific classes", () => {
    render(<Text variant="lead">Lead</Text>)
    expect(screen.getByText("Lead").className).toContain("text-xl")

    render(<Text variant="muted">Muted</Text>)
    expect(screen.getByText("Muted").className).toContain(
      "text-muted-foreground",
    )

    render(<Text variant="subtle">Subtle</Text>)
    expect(screen.getByText("Subtle").className).toContain("text-foreground/60")
  })

  it("sets data-slot and data-variant", () => {
    render(<Text variant="large">Big</Text>)
    const el = screen.getByText("Big")
    expect(el).toHaveAttribute("data-slot", "text")
    expect(el).toHaveAttribute("data-variant", "large")
  })

  it("merges custom className", () => {
    render(<Text className="mt-0">Custom</Text>)
    expect(screen.getByText("Custom").className).toContain("mt-0")
  })

  it("textVariants is a function", () => {
    expect(typeof textVariants).toBe("function")
    expect(textVariants({ variant: "lead" })).toContain("text-xl")
  })
})
