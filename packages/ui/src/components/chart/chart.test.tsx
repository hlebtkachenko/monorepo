import { render, screen } from "@testing-library/react"
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { Bar, BarChart } from "recharts"
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./chart"

// jsdom reports 0x0 for every element; recharts' ResponsiveContainer
// unmounts its children when the measured size is non-positive. Give it
// a fixed size so tooltip content actually renders.
beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    bottom: 300,
    right: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
})

afterAll(() => {
  vi.restoreAllMocks()
})

const config: ChartConfig = {
  value: { label: "Value", color: "#2563eb" },
}

const tooltipPayload = [
  {
    name: "value",
    dataKey: "value",
    graphicalItemId: "value",
    value: 1234567.89,
    color: "#2563eb",
    payload: { name: "A", value: 1234567.89 },
  },
]

describe("ChartContainer", () => {
  it("renders without crash", () => {
    render(
      <ChartContainer config={config} data-testid="chart">
        <BarChart data={[{ name: "A", value: 10 }]}>
          <Bar dataKey="value" />
        </BarChart>
      </ChartContainer>,
    )
    expect(screen.getByTestId("chart")).toBeInTheDocument()
  })
})

describe("ChartTooltipContent locale", () => {
  it("formats numeric values with en-US by default", () => {
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent active payload={tooltipPayload} />
      </ChartContainer>,
    )
    expect(screen.getByText("1,234,567.89")).toBeInTheDocument()
  })

  it("formats numeric values with the given locale", () => {
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent active payload={tooltipPayload} locale="cs-CZ" />
      </ChartContainer>,
    )
    // Testing Library's default normalizer folds NBSP group separators
    // into ASCII spaces in the element text, so fold the matcher too.
    const expected = (1234567.89).toLocaleString("cs-CZ").replace(/\s/g, " ")
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
