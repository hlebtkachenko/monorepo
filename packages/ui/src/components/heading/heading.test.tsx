import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Heading, headingVariants } from "./heading"

describe("Heading", () => {
  it("renders as h1 by default", () => {
    const { container } = render(<Heading>Title</Heading>)
    expect(container.querySelector("h1")).toBeInTheDocument()
    expect(screen.getByText("Title")).toBeInTheDocument()
  })

  it("renders correct element for each level", () => {
    const { container: c1 } = render(<Heading level={1}>H1</Heading>)
    expect(c1.querySelector("h1")).toBeInTheDocument()

    const { container: c2 } = render(<Heading level={2}>H2</Heading>)
    expect(c2.querySelector("h2")).toBeInTheDocument()

    const { container: c3 } = render(<Heading level={3}>H3</Heading>)
    expect(c3.querySelector("h3")).toBeInTheDocument()

    const { container: c4 } = render(<Heading level={4}>H4</Heading>)
    expect(c4.querySelector("h4")).toBeInTheDocument()
  })

  it("applies level-specific classes", () => {
    render(<Heading level={1}>Big</Heading>)
    expect(screen.getByText("Big").className).toContain("text-4xl")

    render(<Heading level={3}>Medium</Heading>)
    expect(screen.getByText("Medium").className).toContain("text-2xl")
  })

  it("sets data-slot and data-level", () => {
    render(<Heading level={2}>Test</Heading>)
    const el = screen.getByText("Test")
    expect(el).toHaveAttribute("data-slot", "heading")
    expect(el).toHaveAttribute("data-level", "2")
  })

  it("merges custom className", () => {
    render(<Heading className="mt-8">Custom</Heading>)
    expect(screen.getByText("Custom").className).toContain("mt-8")
  })

  it("headingVariants is a function", () => {
    expect(typeof headingVariants).toBe("function")
    expect(headingVariants({ level: 2 })).toContain("text-3xl")
  })
})
