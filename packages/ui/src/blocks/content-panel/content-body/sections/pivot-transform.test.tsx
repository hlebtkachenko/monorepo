import { describe, it, expect } from "vitest"

import { buildPivot, type PivotCell } from "./pivot-transform"
import type { TableSectionRow } from "./section-table"

const cellValue = (c: PivotCell | undefined) =>
  c && c.kind === "value" ? c.value : undefined

describe("buildPivot", () => {
  it("single row-dim, single sum measure, first-seen columns, grand total", () => {
    const rows: TableSectionRow[] = [
      { region: "EU", product: "A", amount: 10 },
      { region: "EU", product: "B", amount: 5 },
      { region: "US", product: "A", amount: 7 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "region" }],
      columnDimensions: [],
      measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
    })
    // One leaf column (no column dims → the measure is the only column).
    expect(r.leafColumns).toHaveLength(1)
    const leaf = r.leafColumns[0]!.id
    expect(r.rows.map((row) => row.label)).toEqual(["EU", "US"])
    expect(cellValue(r.rows[0]!.values[leaf])).toBe(15) // EU: 10+5
    expect(cellValue(r.rows[1]!.values[leaf])).toBe(7) // US
    expect(cellValue(r.grandTotals[leaf])).toBe(22) // grand total
  })

  it("rolls subtotals up from source rows — a true mean at every level (avg)", () => {
    const rows: TableSectionRow[] = [
      { region: "EU", country: "CZ", amount: 10 },
      { region: "EU", country: "CZ", amount: 20 },
      { region: "EU", country: "DE", amount: 60 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "region" }, { field: "country" }],
      columnDimensions: [],
      measures: [{ id: "a", label: "Avg", agg: "avg", field: "amount" }],
    })
    const leaf = r.leafColumns[0]!.id
    const eu = r.rows[0]!
    // EU avg is the TRUE mean of 10,20,60 = 30 — NOT mean-of-means ((15+60)/2=37.5).
    expect(cellValue(eu.values[leaf])).toBe(30)
    expect(cellValue(eu.subRows![0]!.values[leaf])).toBe(15) // CZ: (10+20)/2
    expect(cellValue(eu.subRows![1]!.values[leaf])).toBe(60) // DE
  })

  it("multi-level column hierarchy: leafColumns order + columnTree shape", () => {
    const rows: TableSectionRow[] = [
      { region: "EU", q: "Q1", amount: 1 },
      { region: "EU", q: "Q2", amount: 2 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "region" }],
      columnDimensions: [{ field: "q" }],
      measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
    })
    // Two column buckets (Q1, Q2) × one measure = 2 leaves, colPath-major.
    expect(r.leafColumns.map((l) => l.columnPath)).toEqual([["Q1"], ["Q2"]])
    expect(r.columnTree).toHaveLength(2) // Q1, Q2 group nodes
    expect(r.columnTree[0]!.label).toBe("Q1")
    expect(r.columnTree[0]!.children).toHaveLength(1) // the measure leaf
  })

  it("count is 0 (not empty) on an empty bucket; sum is empty", () => {
    const rows: TableSectionRow[] = [{ region: "EU", q: "Q1", amount: 5 }]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "region" }],
      columnDimensions: [{ field: "q" }],
      columnOrder: { q: ["Q1", "Q2"] }, // Q2 has no rows → empty bucket
      measures: [
        { id: "n", label: "Count", agg: "count" },
        { id: "s", label: "Sum", agg: "sum", field: "amount" },
      ],
    })
    // leaves: [Q1·Count, Q1·Sum, Q2·Count, Q2·Sum]
    const [q1n, q1s, q2n, q2s] = r.leafColumns.map((l) => l.id)
    expect(cellValue(r.rows[0]!.values[q1n!])).toBe(1)
    expect(cellValue(r.rows[0]!.values[q1s!])).toBe(5)
    expect(cellValue(r.rows[0]!.values[q2n!])).toBe(0) // count → 0
    expect(r.rows[0]!.values[q2s!]).toEqual({ kind: "empty" }) // sum → empty
  })

  it("countDistinct, min, max", () => {
    const rows: TableSectionRow[] = [
      { g: "x", who: "a", v: 3 },
      { g: "x", who: "a", v: 9 },
      { g: "x", who: "b", v: 1 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "g" }],
      columnDimensions: [],
      measures: [
        {
          id: "d",
          label: "Distinct",
          agg: "countDistinct",
          distinctField: "who",
        },
        { id: "mn", label: "Min", agg: "min", field: "v" },
        { id: "mx", label: "Max", agg: "max", field: "v" },
      ],
    })
    const [d, mn, mx] = r.leafColumns.map((l) => l.id)
    expect(cellValue(r.rows[0]!.values[d!])).toBe(2) // a, b
    expect(cellValue(r.rows[0]!.values[mn!])).toBe(1)
    expect(cellValue(r.rows[0]!.values[mx!])).toBe(9)
  })

  it("cross-currency: sum over >1 currency is mixed; count stays numeric", () => {
    const rows: TableSectionRow[] = [
      { g: "x", cur: "CZK", amount: 100 },
      { g: "x", cur: "EUR", amount: 4 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "g" }],
      columnDimensions: [],
      measures: [
        {
          id: "s",
          label: "Sum",
          agg: "sum",
          field: "amount",
          currencyField: "cur",
        },
        { id: "n", label: "Count", agg: "count" },
      ],
    })
    const [s, n] = r.leafColumns.map((l) => l.id)
    expect(r.rows[0]!.values[s!]).toEqual({ kind: "mixed" })
    expect(cellValue(r.rows[0]!.values[n!])).toBe(2)
  })

  it("single currency keeps the currency on the value", () => {
    const rows: TableSectionRow[] = [
      { g: "x", cur: "CZK", amount: 100 },
      { g: "x", cur: "CZK", amount: 50 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "g" }],
      columnDimensions: [],
      measures: [
        {
          id: "s",
          label: "Sum",
          agg: "sum",
          field: "amount",
          currencyField: "cur",
        },
      ],
    })
    expect(r.rows[0]!.values[r.leafColumns[0]!.id]).toEqual({
      kind: "value",
      value: 150,
      currency: "CZK",
    })
  })

  it("row labels with `/` or `,` do not collide (JSON path ids)", () => {
    const rows: TableSectionRow[] = [
      { a: "x/y", b: "z", v: 1 },
      { a: "x", b: "y/z", v: 2 },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "a" }, { field: "b" }],
      columnDimensions: [],
      measures: [{ id: "s", label: "S", agg: "sum", field: "v" }],
    })
    const ids = new Set<string>()
    const walk = (rr: readonly { id: string; subRows?: readonly any[] }[]) => {
      for (const node of rr) {
        expect(ids.has(node.id)).toBe(false)
        ids.add(node.id)
        if (node.subRows) walk(node.subRows)
      }
    }
    walk(r.rows)
  })

  it("ignores non-finite source values (never coerced to 0)", () => {
    const rows: TableSectionRow[] = [
      { g: "x", v: 10 },
      { g: "x", v: null },
    ]
    const r = buildPivot({
      rows,
      rowDimensions: [{ field: "g" }],
      columnDimensions: [],
      measures: [
        { id: "s", label: "Sum", agg: "sum", field: "v" },
        { id: "a", label: "Avg", agg: "avg", field: "v" },
      ],
    })
    const [s, a] = r.leafColumns.map((l) => l.id)
    expect(cellValue(r.rows[0]!.values[s!])).toBe(10) // null ignored
    expect(cellValue(r.rows[0]!.values[a!])).toBe(10) // avg over 1 finite value
  })

  it("empty rows → no pivot rows, empty grand totals", () => {
    const r = buildPivot({
      rows: [],
      rowDimensions: [{ field: "g" }],
      columnDimensions: [],
      measures: [{ id: "s", label: "S", agg: "sum", field: "v" }],
    })
    expect(r.rows).toHaveLength(0)
    expect(r.grandTotals[r.leafColumns[0]!.id]).toEqual({ kind: "empty" })
  })
})
