import { describe, it, expect } from "vitest"

import { sectionPivotTable } from "./section-pivot-table"

const base = {
  rows: [{ region: "EU", month: "Jan", amount: 10 }],
  rowDimensions: [{ field: "region" }],
  columnDimensions: [{ field: "month" }],
  measures: [
    { id: "amt", label: "Amount", agg: "sum" as const, field: "amount" },
  ],
}

describe("sectionPivotTable — construction guards", () => {
  it("builds a valid config as a branded pivot-table section", () => {
    const section = sectionPivotTable({ ...base, anchor: "totals" })
    expect(section.kind).toBe("pivot-table")
    expect(section.fill).toBe(true)
    expect(section.anchor).toBe("totals")
    // `anchor` is section-level metadata, never leaked into the renderer payload.
    expect("anchor" in section.props).toBe(false)
  })

  it("requires at least one row dimension", () => {
    expect(() => sectionPivotTable({ ...base, rowDimensions: [] })).toThrow(
      /rowDimensions/i,
    )
  })

  it("requires at least one measure", () => {
    expect(() => sectionPivotTable({ ...base, measures: [] })).toThrow(
      /measures/i,
    )
  })

  it("rejects duplicate measure ids", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [
          { id: "amt", label: "A", agg: "sum", field: "amount" },
          { id: "amt", label: "B", agg: "max", field: "amount" },
        ],
      }),
    ).toThrow(/duplicate measure id/i)
  })

  it("rejects a measure id equal to the reserved label column id", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [
          { id: "__rowlabel", label: "X", agg: "sum", field: "amount" },
        ],
      }),
    ).toThrow(/reserved/i)
  })

  it("requires a numeric field for sum/avg/min/max", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [{ id: "amt", label: "Amount", agg: "sum" }],
      }),
    ).toThrow(/requires `field`/i)
  })

  it("requires a distinctField for countDistinct", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [{ id: "d", label: "Distinct", agg: "countDistinct" }],
      }),
    ).toThrow(/distinctField/i)
  })

  it("allows a count measure with no field", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [{ id: "n", label: "Count", agg: "count" }],
      }),
    ).not.toThrow()
  })

  it("requires a currency when a measure format is currency", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [
          {
            id: "amt",
            label: "Amount",
            agg: "sum",
            field: "amount",
            format: { style: "currency" },
          },
        ],
      }),
    ).toThrow(/format\.currency/i)
  })

  it("accepts a currency format that supplies its code", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        measures: [
          {
            id: "amt",
            label: "Amount",
            agg: "sum",
            field: "amount",
            format: { style: "currency", currency: "CZK" },
          },
        ],
      }),
    ).not.toThrow()
  })

  it("rejects a duplicate columnOrder value", () => {
    expect(() =>
      sectionPivotTable({
        ...base,
        columnOrder: { month: ["Jan", "Jan"] },
      }),
    ).toThrow(/duplicate columnOrder value/i)
  })
})
