import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
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

  it("notifies the controlled owner when the signature is cleared", async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<SignaturePad paths={["M0 0L1 1"]} onClear={onClear} />)

    await user.click(screen.getByRole("button", { name: "Clear signature" }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
