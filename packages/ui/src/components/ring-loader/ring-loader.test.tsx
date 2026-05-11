import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RingLoader } from "./ring-loader"

describe("RingLoader", () => {
  it("renders as role=status with aria-label", () => {
    render(<RingLoader />)
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
  })

  it("applies default size class", () => {
    render(<RingLoader />)
    expect(screen.getByRole("status").getAttribute("class")).toContain("size-6")
  })

  it("accepts custom className", () => {
    render(<RingLoader className="size-10 text-primary" />)
    expect(screen.getByRole("status").getAttribute("class")).toContain(
      "size-10",
    )
  })

  it("supports --duration override via style", () => {
    render(<RingLoader style={{ "--duration": "2s" } as React.CSSProperties} />)
    const el = screen.getByRole("status") as unknown as SVGSVGElement
    expect(el.style.getPropertyValue("--duration")).toBe("2s")
  })
})
