import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { SegmentedInput, SegmentedInputItem } from "./segmented-input"

describe("SegmentedInput", () => {
  it("renders root with data-slot", () => {
    const { container } = render(
      <SegmentedInput>
        <SegmentedInputItem placeholder="A" />
        <SegmentedInputItem placeholder="B" />
      </SegmentedInput>,
    )
    expect(
      container.querySelector("[data-slot=segmented-input]"),
    ).toBeInTheDocument()
  })

  it("renders all items", () => {
    render(
      <SegmentedInput>
        <SegmentedInputItem placeholder="MM" maxLength={2} />
        <SegmentedInputItem placeholder="DD" maxLength={2} />
        <SegmentedInputItem placeholder="YYYY" maxLength={4} />
      </SegmentedInput>,
    )
    expect(screen.getByPlaceholderText("MM")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("DD")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("YYYY")).toBeInTheDocument()
  })

  it("assigns positions to items", () => {
    const { container } = render(
      <SegmentedInput>
        <SegmentedInputItem placeholder="A" />
        <SegmentedInputItem placeholder="B" />
        <SegmentedInputItem placeholder="C" />
      </SegmentedInput>,
    )
    const items = container.querySelectorAll("[data-slot=segmented-input-item]")
    expect(items[0]).toHaveAttribute("data-position", "first")
    expect(items[1]).toHaveAttribute("data-position", "middle")
    expect(items[2]).toHaveAttribute("data-position", "last")
  })

  it("isolated position for single item", () => {
    const { container } = render(
      <SegmentedInput>
        <SegmentedInputItem placeholder="solo" />
      </SegmentedInput>,
    )
    const item = container.querySelector("[data-slot=segmented-input-item]")
    expect(item).toHaveAttribute("data-position", "isolated")
  })

  it("disables all items via root prop", () => {
    render(
      <SegmentedInput disabled>
        <SegmentedInputItem placeholder="A" />
        <SegmentedInputItem placeholder="B" />
      </SegmentedInput>,
    )
    expect(screen.getByPlaceholderText("A")).toBeDisabled()
    expect(screen.getByPlaceholderText("B")).toBeDisabled()
  })

  it("sets aria-orientation on root", () => {
    const { container } = render(
      <SegmentedInput orientation="vertical">
        <SegmentedInputItem placeholder="A" />
      </SegmentedInput>,
    )
    expect(
      container.querySelector("[data-slot=segmented-input]"),
    ).toHaveAttribute("aria-orientation", "vertical")
  })
})
