import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { InputSegmented, InputSegmentedItem } from "./input-segmented"

describe("InputSegmented", () => {
  it("renders root with data-slot", () => {
    const { container } = render(
      <InputSegmented>
        <InputSegmentedItem placeholder="A" />
        <InputSegmentedItem placeholder="B" />
      </InputSegmented>,
    )
    expect(
      container.querySelector("[data-slot=input-segmented]"),
    ).toBeInTheDocument()
  })

  it("renders all items", () => {
    render(
      <InputSegmented>
        <InputSegmentedItem placeholder="MM" maxLength={2} />
        <InputSegmentedItem placeholder="DD" maxLength={2} />
        <InputSegmentedItem placeholder="YYYY" maxLength={4} />
      </InputSegmented>,
    )
    expect(screen.getByPlaceholderText("MM")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("DD")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("YYYY")).toBeInTheDocument()
  })

  it("assigns positions to items", () => {
    const { container } = render(
      <InputSegmented>
        <InputSegmentedItem placeholder="A" />
        <InputSegmentedItem placeholder="B" />
        <InputSegmentedItem placeholder="C" />
      </InputSegmented>,
    )
    const items = container.querySelectorAll("[data-slot=input-segmented-item]")
    expect(items[0]).toHaveAttribute("data-position", "first")
    expect(items[1]).toHaveAttribute("data-position", "middle")
    expect(items[2]).toHaveAttribute("data-position", "last")
  })

  it("isolated position for single item", () => {
    const { container } = render(
      <InputSegmented>
        <InputSegmentedItem placeholder="solo" />
      </InputSegmented>,
    )
    const item = container.querySelector("[data-slot=input-segmented-item]")
    expect(item).toHaveAttribute("data-position", "isolated")
  })

  it("disables all items via root prop", () => {
    render(
      <InputSegmented disabled>
        <InputSegmentedItem placeholder="A" />
        <InputSegmentedItem placeholder="B" />
      </InputSegmented>,
    )
    expect(screen.getByPlaceholderText("A")).toBeDisabled()
    expect(screen.getByPlaceholderText("B")).toBeDisabled()
  })

  it("sets aria-orientation on root", () => {
    const { container } = render(
      <InputSegmented orientation="vertical">
        <InputSegmentedItem placeholder="A" />
      </InputSegmented>,
    )
    expect(
      container.querySelector("[data-slot=input-segmented]"),
    ).toHaveAttribute("aria-orientation", "vertical")
  })
})
