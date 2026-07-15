import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { SectionPivotTableRenderer } from "./section-pivot-table-renderer"
import type { SectionPivotTablePayload } from "./section-pivot-table"

const payload: SectionPivotTablePayload = {
  rows: [
    { region: "North", product: "A", amount: 10 },
    { region: "North", product: "B", amount: 5 },
    { region: "South", product: "A", amount: 7 },
    { region: "South", product: "B", amount: 3 },
  ],
  rowGroups: ["region"],
  pivotColumn: "product",
  valueField: "amount",
}

describe("SectionPivotTableRenderer", () => {
  it("renders a grand-total row summing every value column", () => {
    render(
      <div className="flex h-96 flex-col">
        <SectionPivotTableRenderer props={payload} />
      </div>,
    )
    expect(screen.getByText("North")).toBeInTheDocument()
    expect(screen.getByText("South")).toBeInTheDocument()
    const total = screen.getByText("Total")
    expect(total).toBeInTheDocument()
    // grandTotals: A = 10 + 7 = 17, B = 5 + 3 = 8.
    expect(screen.getByText("17")).toBeInTheDocument()
    expect(screen.getByText("8")).toBeInTheDocument()
  })

  it("gives the total row's label extra weight over a regular group row", () => {
    render(
      <div className="flex h-96 flex-col">
        <SectionPivotTableRenderer props={payload} />
      </div>,
    )
    expect(screen.getByText("Total").className).toContain("font-semibold")
    expect(screen.getByText("North").className).not.toContain("font-semibold")
  })

  it("does not render a total row when the pivot has no rows", () => {
    render(
      <div className="flex h-96 flex-col">
        <SectionPivotTableRenderer
          props={{ ...payload, rows: [], emptyText: "Nothing here." }}
        />
      </div>,
    )
    expect(screen.queryByText("Total")).not.toBeInTheDocument()
    expect(screen.getByText("Nothing here.")).toBeInTheDocument()
  })
})
