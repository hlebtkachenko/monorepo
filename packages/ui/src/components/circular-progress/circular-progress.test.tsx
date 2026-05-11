import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
  CircularProgressValueText,
} from "./circular-progress"

function Composed({ value }: { value?: number | null }) {
  return (
    <CircularProgress value={value}>
      <CircularProgressIndicator>
        <CircularProgressTrack />
        <CircularProgressRange />
      </CircularProgressIndicator>
      <CircularProgressValueText />
    </CircularProgress>
  )
}

describe("CircularProgress", () => {
  it("renders progressbar role with aria-valuenow", () => {
    render(<Composed value={42} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    )
  })

  it("renders default percentage label", () => {
    render(<Composed value={50} />)
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("sets indeterminate state for null value", () => {
    render(<Composed value={null} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "data-state",
      "indeterminate",
    )
  })

  it("clamps value above max", () => {
    render(<Composed value={150} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
  })

  it("complete state when value equals max", () => {
    render(<Composed value={100} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "data-state",
      "complete",
    )
  })
})
