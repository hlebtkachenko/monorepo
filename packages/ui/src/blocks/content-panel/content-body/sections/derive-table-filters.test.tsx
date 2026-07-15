import { describe, expect, it } from "vitest"

import type { FiltersState } from "@workspace/ui/components/filter-bar"

import { applyTableFilters, deriveFilterColumns } from "./derive-table-filters"
import type { TableColumnSpec, TableSectionRow } from "./section-table"

const COLUMNS: TableColumnSpec[] = [
  { id: "name", header: "Name", kind: "text", filter: { variant: "text" } },
  {
    id: "amount",
    header: "Amount",
    kind: "number",
    filter: { variant: "number" },
  },
  {
    id: "kind",
    header: "Kind",
    kind: "select",
    options: [
      { value: "in", label: "Incoming" },
      { value: "out", label: "Outgoing" },
    ],
    filter: { variant: "option" },
  },
  // No `filter` preset — must be ignored by the derivation.
  { id: "note", header: "Note", kind: "text" },
]

const ROWS: TableSectionRow[] = [
  { id: "1", name: "Alpha Holdings", amount: 500, kind: "in", note: "x" },
  { id: "2", name: "Bravo Trading", amount: 50, kind: "out", note: "y" },
  { id: "3", name: "Alpha Services", amount: 900, kind: "in", note: "z" },
]

describe("deriveFilterColumns", () => {
  it("builds one filter config per column with a `filter` preset (skips the rest)", () => {
    const configs = deriveFilterColumns(COLUMNS)
    expect(configs.map((c) => c.id)).toEqual(["name", "amount", "kind"])
    expect(configs.map((c) => c.type)).toEqual(["text", "number", "option"])
    expect(configs.map((c) => c.displayName)).toEqual([
      "Name",
      "Amount",
      "Kind",
    ])
  })

  it("defaults an option preset's values to the column's own `options`", () => {
    const [, , kind] = deriveFilterColumns(COLUMNS)
    expect(kind?.options).toEqual([
      { value: "in", label: "Incoming" },
      { value: "out", label: "Outgoing" },
    ])
  })

  it("reads a text cell from the row record by column id", () => {
    const [name] = deriveFilterColumns(COLUMNS)
    expect(name?.accessor({ name: "Zeta" } as TableSectionRow)).toBe("Zeta")
  })
})

describe("applyTableFilters", () => {
  it("returns a copy of all rows when there are no filters", () => {
    const out = applyTableFilters(ROWS, [], COLUMNS)
    expect(out).toEqual(ROWS)
    expect(out).not.toBe(ROWS)
  })

  it("narrows by a text `contains` filter (derived from the column variant)", () => {
    const filters: FiltersState = [
      {
        columnId: "name",
        type: "text",
        operator: "contains",
        values: ["alpha"],
      },
    ]
    expect(applyTableFilters(ROWS, filters, COLUMNS).map((r) => r.id)).toEqual([
      "1",
      "3",
    ])
  })

  it("narrows by a number filter", () => {
    const filters: FiltersState = [
      {
        columnId: "amount",
        type: "number",
        operator: "is greater than",
        values: [100],
      },
    ]
    expect(applyTableFilters(ROWS, filters, COLUMNS).map((r) => r.id)).toEqual([
      "1",
      "3",
    ])
  })

  it("ignores a filter that targets a column with no preset (no narrowing)", () => {
    const filters: FiltersState = [
      { columnId: "note", type: "text", operator: "contains", values: ["x"] },
    ]
    expect(applyTableFilters(ROWS, filters, COLUMNS)).toHaveLength(ROWS.length)
  })
})
