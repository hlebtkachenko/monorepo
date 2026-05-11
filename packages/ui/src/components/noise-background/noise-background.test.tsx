import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { NoiseBackground } from "./noise-background"

describe("NoiseBackground", () => {
  it("renders children", () => {
    render(
      <NoiseBackground>
        <span>Hello</span>
      </NoiseBackground>,
    )
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("sets --noise-opacity from noiseIntensity", () => {
    render(<NoiseBackground noiseIntensity={0.5} data-testid="noise" />)
    // root container is the only div without `relative z-10` — find via data-slot
    const root = document.querySelector(
      '[data-slot="noise-background"]',
    ) as HTMLElement
    expect(root.style.getPropertyValue("--noise-opacity")).toBe("0.5")
  })

  it("renders SVG noise filter overlay", () => {
    render(<NoiseBackground />)
    const filter = document.getElementById("noise-background-noise")
    expect(filter).not.toBeNull()
  })
})
