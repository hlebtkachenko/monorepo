import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { SignaturePad } from "./signature-pad"

describe("SignaturePad", () => {
  it("renders root with data-slot", () => {
    const { container } = render(<SignaturePad />)
    expect(
      container.querySelector("[data-slot=signature-pad]"),
    ).toBeInTheDocument()
  })

  it("renders control, segment, and guide slots", () => {
    const { container } = render(<SignaturePad />)
    expect(
      container.querySelector("[data-slot=signature-pad-control]"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot=signature-pad-segment]"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot=signature-pad-guide]"),
    ).toBeInTheDocument()
  })

  it("renders clear trigger as a button", () => {
    const { container } = render(<SignaturePad />)
    const clear = container.querySelector("[data-slot=signature-pad-clear]")
    expect(clear).toBeInTheDocument()
    expect(clear?.tagName.toLowerCase()).toBe("button")
  })
})
