import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Marquee } from "./marquee"

describe("Marquee", () => {
  it("repeats children 4 times by default", () => {
    render(
      <Marquee>
        <span>item</span>
      </Marquee>,
    )
    expect(screen.getAllByText("item")).toHaveLength(4)
  })

  it("honors repeat prop", () => {
    render(
      <Marquee repeat={2}>
        <span>x</span>
      </Marquee>,
    )
    expect(screen.getAllByText("x")).toHaveLength(2)
  })

  it("flips orientation when vertical", () => {
    render(
      <Marquee vertical>
        <span>v</span>
      </Marquee>,
    )
    const root = screen.getAllByText("v")[0]!.closest('[data-slot="marquee"]')
    expect(root).toHaveAttribute("data-orientation", "vertical")
  })

  it("adds animation-direction reverse class when reverse", () => {
    const { container } = render(
      <Marquee reverse>
        <span>r</span>
      </Marquee>,
    )
    const track = container.querySelector(".animate-marquee")
    expect(track?.className).toContain("[animation-direction:reverse]")
  })
})
