import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { DataTrack } from "./data-track"

const listData = [
  { name: "/home", value: 843 },
  { name: "/dashboard", value: 621 },
  { name: "/settings", value: 435 },
]

const trackerData = [
  { key: "ok", color: "var(--chart-2)", tooltip: "Healthy" },
  { key: "err", color: "var(--destructive)", tooltip: "Outage" },
  { key: "none" },
]

describe("DataTrack — list variant", () => {
  it("renders the container with list variant marker", () => {
    render(<DataTrack variant="list" data={listData} />)
    const el = document.querySelector('[data-slot="data-track"]')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute("data-variant", "list")
  })

  it("renders all item names", () => {
    render(<DataTrack variant="list" data={listData} />)
    expect(screen.getByText("/home")).toBeInTheDocument()
    expect(screen.getByText("/dashboard")).toBeInTheDocument()
    expect(screen.getByText("/settings")).toBeInTheDocument()
  })

  it("renders formatted values", () => {
    render(
      <DataTrack
        variant="list"
        data={listData}
        valueFormatter={(v) => `${v}px`}
      />,
    )
    expect(screen.getByText("843px")).toBeInTheDocument()
  })

  it("renders links when href provided", () => {
    render(
      <DataTrack
        variant="list"
        data={[{ name: "GitHub", value: 500, href: "https://github.com" }]}
      />,
    )
    const link = screen.getByRole("link", { name: "GitHub" })
    expect(link).toHaveAttribute("href", "https://github.com")
  })

  it("calls onValueChange when an interactive row is clicked", () => {
    const handler = vi.fn()
    render(<DataTrack variant="list" data={listData} onValueChange={handler} />)
    const btn = screen.getAllByRole("button")[0]!
    fireEvent.click(btn)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: "/home" }),
    )
  })

  it("defaults to the list variant when variant is omitted", () => {
    render(<DataTrack data={listData} />)
    expect(document.querySelector('[data-slot="data-track"]')).toHaveAttribute(
      "data-variant",
      "list",
    )
  })
})

describe("DataTrack — tracker variant", () => {
  it("renders the container with tracker variant marker", () => {
    render(<DataTrack variant="tracker" data={trackerData} />)
    const el = document.querySelector('[data-slot="data-track"]')
    expect(el).toHaveAttribute("data-variant", "tracker")
  })

  it("renders one block per data item", () => {
    render(<DataTrack variant="tracker" data={trackerData} />)
    expect(
      document.querySelectorAll('[data-slot="data-track-block"]'),
    ).toHaveLength(3)
  })

  it("applies custom block color via inline style", () => {
    render(
      <DataTrack
        variant="tracker"
        data={[{ key: "a", color: "var(--chart-1)" }]}
      />,
    )
    const block = document.querySelector('[data-slot="data-track-block"]')
    expect(block).toHaveStyle({ backgroundColor: "var(--chart-1)" })
  })

  it("uses defaultColor when a block has no color", () => {
    render(
      <DataTrack
        variant="tracker"
        data={[{ key: "x" }]}
        defaultColor="var(--muted)"
      />,
    )
    const block = document.querySelector('[data-slot="data-track-block"]')
    expect(block).toHaveStyle({ backgroundColor: "var(--muted)" })
  })

  it("applies the hover effect class when hoverEffect=true", () => {
    render(
      <DataTrack
        variant="tracker"
        data={[{ key: "a", color: "var(--chart-2)" }]}
        hoverEffect
      />,
    )
    const block = document.querySelector('[data-slot="data-track-block"]')
    expect(block?.className).toContain("hover:opacity-70")
  })
})
