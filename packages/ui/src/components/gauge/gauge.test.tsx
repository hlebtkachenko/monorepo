import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  Gauge,
  GaugeIndicator,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "./gauge"

function MeterDefault({ value }: { value?: number | null }) {
  return (
    <Gauge value={value}>
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange />
      </GaugeIndicator>
      <GaugeValueText />
    </Gauge>
  )
}

describe("Gauge", () => {
  it("renders role=meter with aria-valuenow", () => {
    render(<MeterDefault value={50} />)
    const meter = screen.getByRole("meter")
    expect(meter).toHaveAttribute("aria-valuenow", "50")
    expect(meter).toHaveAttribute("aria-valuemax", "100")
    expect(meter).toHaveAttribute("aria-valuemin", "0")
  })

  it("shows indeterminate state when value is null", () => {
    render(<MeterDefault value={null} />)
    expect(screen.getByRole("meter")).toHaveAttribute(
      "data-state",
      "indeterminate",
    )
  })

  it("shows complete state when value === max", () => {
    render(<MeterDefault value={100} />)
    expect(screen.getByRole("meter")).toHaveAttribute("data-state", "complete")
  })

  it("clamps value above max", () => {
    render(<MeterDefault value={150} />)
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100")
  })

  it("renders value text as percentage by default", () => {
    render(<MeterDefault value={25} />)
    expect(screen.getByText("25")).toBeInTheDocument()
  })
})
