import { describe, expect, it } from "vitest"

import type { FiltersState } from "@workspace/ui/components/filter-bar"

import { applyTableFilters, deriveFilterColumns } from "./derive-table-filters"
import { filterVariantForKind } from "./section-table"
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
  it("builds one filter config per column — all filterable by default", () => {
    // `note` declares no `filter`, yet is still derived (default-on): its variant
    // comes from `kind` (`text`).
    const configs = deriveFilterColumns(COLUMNS)
    expect(configs.map((c) => c.id)).toEqual(["name", "amount", "kind", "note"])
    expect(configs.map((c) => c.type)).toEqual([
      "text",
      "number",
      "option",
      "text",
    ])
    expect(configs.map((c) => c.displayName)).toEqual([
      "Name",
      "Amount",
      "Kind",
      "Note",
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

describe("filterVariantForKind", () => {
  it("maps every column kind to its default filter variant", () => {
    expect(filterVariantForKind("text")).toBe("text")
    expect(filterVariantForKind("number")).toBe("number")
    expect(filterVariantForKind("select")).toBe("option")
    expect(filterVariantForKind("badge")).toBe("option")
  })
})

describe("filter: true — kind derives the variant", () => {
  it("a `select` column becomes an OPTION filter carrying its own `options` (never a text search)", () => {
    const columns: TableColumnSpec[] = [
      {
        id: "company",
        header: "Company",
        kind: "select",
        options: [
          { value: "acme", label: "Acme" },
          { value: "globex", label: "Globex" },
        ],
        filter: true,
      },
    ]
    const [company] = deriveFilterColumns(columns)
    expect(company?.type).toBe("option")
    expect(company?.options).toEqual([
      { value: "acme", label: "Acme" },
      { value: "globex", label: "Globex" },
    ])
  })

  it("a `badge` column becomes an OPTION filter carrying its own `options`", () => {
    const columns: TableColumnSpec[] = [
      {
        id: "status",
        header: "Status",
        kind: "badge",
        options: [
          { value: "open", label: "Open" },
          { value: "done", label: "Done" },
        ],
        filter: true,
      },
    ]
    const [status] = deriveFilterColumns(columns)
    expect(status?.type).toBe("option")
    expect(status?.options).toEqual([
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ])
  })

  it("a `number` column becomes a NUMBER filter", () => {
    const columns: TableColumnSpec[] = [
      { id: "amount", header: "Amount", kind: "number", filter: true },
    ]
    expect(deriveFilterColumns(columns)[0]?.type).toBe("number")
  })

  it("a `text` column becomes a TEXT filter", () => {
    const columns: TableColumnSpec[] = [
      { id: "note", header: "Note", kind: "text", filter: true },
    ]
    expect(deriveFilterColumns(columns)[0]?.type).toBe("text")
  })

  it("an explicit `filter: { variant }` still overrides the kind default", () => {
    // A `select` (kind default `option`) forced to a text search.
    const columns: TableColumnSpec[] = [
      {
        id: "company",
        header: "Company",
        kind: "select",
        options: [{ value: "acme", label: "Acme" }],
        filter: { variant: "text" },
      },
    ]
    expect(deriveFilterColumns(columns)[0]?.type).toBe("text")
  })

  it("a column with `filter` absent IS in the set — filterable by default", () => {
    const columns: TableColumnSpec[] = [
      { id: "note", header: "Note", kind: "text" },
    ]
    const [note] = deriveFilterColumns(columns)
    expect(note?.id).toBe("note")
    expect(note?.type).toBe("text") // variant derived from kind
  })

  it("a column with `filter: false` is not in the derived filter set", () => {
    const columns: TableColumnSpec[] = [
      { id: "note", header: "Note", kind: "text", filter: false },
    ]
    expect(deriveFilterColumns(columns)).toHaveLength(0)
  })

  it("applies a `filter: true` select as an option pre-filter over the rows", () => {
    const columns: TableColumnSpec[] = [
      {
        id: "company",
        header: "Company",
        kind: "select",
        options: [
          { value: "acme", label: "Acme" },
          { value: "globex", label: "Globex" },
        ],
        filter: true,
      },
    ]
    const rows: TableSectionRow[] = [
      { id: "1", company: "acme" },
      { id: "2", company: "globex" },
      { id: "3", company: "acme" },
    ]
    const filters: FiltersState = [
      {
        columnId: "company",
        type: "option",
        operator: "is",
        values: ["acme"],
      },
    ]
    expect(applyTableFilters(rows, filters, columns).map((r) => r.id)).toEqual([
      "1",
      "3",
    ])
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

  it("ignores a filter that targets an opted-out (`filter: false`) column", () => {
    const columns: TableColumnSpec[] = [
      { id: "note", header: "Note", kind: "text", filter: false },
    ]
    const rows: TableSectionRow[] = [
      { id: "1", note: "x" },
      { id: "2", note: "y" },
    ]
    const filters: FiltersState = [
      { columnId: "note", type: "text", operator: "contains", values: ["x"] },
    ]
    // The column opted out, so its filter never narrows.
    expect(applyTableFilters(rows, filters, columns)).toHaveLength(rows.length)
  })
})

describe("numeric missing-vs-zero", () => {
  const NUM_COLUMNS: TableColumnSpec[] = [
    {
      id: "amount",
      header: "Amount",
      kind: "number",
      filter: { variant: "number" },
    },
  ]
  const NUM_ROWS: TableSectionRow[] = [
    { id: "1", amount: 0 }, // real zero
    { id: "2", amount: null }, // explicitly missing
    { id: "3", amount: -5 }, // negative
    { id: "4" }, // key entirely absent — also missing
  ]

  it("deriveFilterColumns' accessor reads a real 0 as 0, negatives as-is, and missing as NaN (not 0)", () => {
    const [amount] = deriveFilterColumns(NUM_COLUMNS)
    expect(amount?.accessor({ amount: 0 } as TableSectionRow)).toBe(0)
    expect(amount?.accessor({ amount: -5 } as TableSectionRow)).toBe(-5)
    expect(Number.isNaN(amount?.accessor({} as TableSectionRow))).toBe(true)
    expect(
      Number.isNaN(amount?.accessor({ amount: null } as TableSectionRow)),
    ).toBe(true)
  })

  it("an `is 0` filter matches the real zero row but not null/absent (missing) rows", () => {
    const filters: FiltersState = [
      { columnId: "amount", type: "number", operator: "is", values: [0] },
    ]
    expect(
      applyTableFilters(NUM_ROWS, filters, NUM_COLUMNS).map((r) => r.id),
    ).toEqual(["1"])
  })

  it("matches negative values with `is less than`", () => {
    const filters: FiltersState = [
      {
        columnId: "amount",
        type: "number",
        operator: "is less than",
        values: [0],
      },
    ]
    expect(
      applyTableFilters(NUM_ROWS, filters, NUM_COLUMNS).map((r) => r.id),
    ).toEqual(["3"])
  })

  it("excludes missing (null and absent) values from a range filter", () => {
    const filters: FiltersState = [
      {
        columnId: "amount",
        type: "number",
        operator: "is between",
        values: [-10, 10],
      },
    ]
    expect(
      applyTableFilters(NUM_ROWS, filters, NUM_COLUMNS).map((r) => r.id),
    ).toEqual(["1", "3"])
  })
})

describe("date missing/malformed policy", () => {
  const DATE_COLUMNS: TableColumnSpec[] = [
    { id: "due", header: "Due", kind: "text", filter: { variant: "date" } },
  ]
  const DATE_ROWS: TableSectionRow[] = [
    { id: "1", due: "2026-01-15" }, // valid
    { id: "2", due: null }, // missing
    { id: "3", due: "not-a-date" }, // malformed
  ]

  it("deriveFilterColumns' accessor parses a valid date and produces Invalid Date for missing/malformed", () => {
    const [due] = deriveFilterColumns(DATE_COLUMNS)
    const accessorDate = (row: TableSectionRow) => due?.accessor(row) as Date
    expect(
      Number.isNaN(
        accessorDate({ due: "2026-01-15" } as TableSectionRow).getTime(),
      ),
    ).toBe(false)
    expect(Number.isNaN(accessorDate({} as TableSectionRow).getTime())).toBe(
      true,
    )
    expect(
      Number.isNaN(
        accessorDate({ due: "not-a-date" } as TableSectionRow).getTime(),
      ),
    ).toBe(true)
  })

  it("matches only the row with a valid date under `is`", () => {
    const filters: FiltersState = [
      {
        columnId: "due",
        type: "date",
        operator: "is",
        values: [new Date("2026-01-15")],
      },
    ]
    expect(
      applyTableFilters(DATE_ROWS, filters, DATE_COLUMNS).map((r) => r.id),
    ).toEqual(["1"])
  })

  it("excludes missing and malformed dates from a range filter", () => {
    const filters: FiltersState = [
      {
        columnId: "due",
        type: "date",
        operator: "is between",
        values: [new Date("2026-01-01"), new Date("2026-01-31")],
      },
    ]
    expect(
      applyTableFilters(DATE_ROWS, filters, DATE_COLUMNS).map((r) => r.id),
    ).toEqual(["1"])
  })
})

describe("multiOption tag trimming", () => {
  const TAG_COLUMNS: TableColumnSpec[] = [
    {
      id: "tags",
      header: "Tags",
      kind: "text",
      filter: {
        variant: "multiOption",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    },
  ]
  const TAG_ROWS: TableSectionRow[] = [
    { id: "1", tags: "a, b" }, // space after comma
    { id: "2", tags: "a,,b" }, // empty middle entry
    { id: "3", tags: "c" },
  ]

  it("trims each split tag and drops empty entries", () => {
    const [tags] = deriveFilterColumns(TAG_COLUMNS)
    expect(tags?.accessor({ tags: "a, b" } as TableSectionRow)).toEqual([
      "a",
      "b",
    ])
    expect(tags?.accessor({ tags: "a,,b" } as TableSectionRow)).toEqual([
      "a",
      "b",
    ])
    expect(tags?.accessor({ tags: " a , b ," } as TableSectionRow)).toEqual([
      "a",
      "b",
    ])
  })

  it("matches a row whose tag has a leading space after the comma", () => {
    const filters: FiltersState = [
      {
        columnId: "tags",
        type: "multiOption",
        operator: "include",
        values: ["b"],
      },
    ]
    expect(
      applyTableFilters(TAG_ROWS, filters, TAG_COLUMNS).map((r) => r.id),
    ).toEqual(["1", "2"])
  })
})

describe("stale/incompatible filter model", () => {
  const MIXED_COLUMNS: TableColumnSpec[] = [
    { id: "due", header: "Due", kind: "text", filter: { variant: "date" } },
  ]
  const MIXED_ROWS: TableSectionRow[] = [{ id: "1", due: "2026-01-15" }]

  it("ignores a filter model whose stored `type` no longer matches the column's current variant, instead of crashing", () => {
    // A stale FilterModel left over from when "due" was configured as an
    // option column — its operator ("is any of") is not a valid
    // DateFilterOperator, so blindly casting it into dateFilterFn would throw.
    const staleFilters: FiltersState = [
      { columnId: "due", type: "option", operator: "is any of", values: ["x"] },
    ]
    expect(() =>
      applyTableFilters(MIXED_ROWS, staleFilters, MIXED_COLUMNS),
    ).not.toThrow()
    expect(
      applyTableFilters(MIXED_ROWS, staleFilters, MIXED_COLUMNS),
    ).toHaveLength(1)
  })

  it("still applies a filter model whose `type` matches the column's current variant", () => {
    const filters: FiltersState = [
      {
        columnId: "due",
        type: "date",
        operator: "is",
        values: [new Date("2026-01-15")],
      },
    ]
    expect(applyTableFilters(MIXED_ROWS, filters, MIXED_COLUMNS)).toHaveLength(
      1,
    )
  })
})
