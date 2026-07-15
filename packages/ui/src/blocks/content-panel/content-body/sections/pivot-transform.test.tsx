import { describe, it, expect } from "vitest"

import { buildPivot } from "./pivot-transform"

describe("buildPivot", () => {
  it("sums per column on a flat single-level hierarchy (default aggregate)", () => {
    const result = buildPivot({
      rows: [
        { region: "North", product: "A", amount: 10 },
        { region: "North", product: "B", amount: 5 },
        { region: "South", product: "A", amount: 7 },
        { region: "South", product: "B", amount: 3 },
      ],
      rowGroups: ["region"],
      pivotColumn: "product",
      valueField: "amount",
    })

    expect(result.columns).toEqual([
      { id: "A", header: "A" },
      { id: "B", header: "B" },
    ])
    expect(result.rows).toHaveLength(2)

    const north = result.rows[0]!
    expect(north.id).toBe("North")
    expect(north.label).toBe("North")
    expect(north.depth).toBe(0)
    expect(north.leafCount).toBe(2)
    expect(north.subRows).toBeUndefined()
    expect(north.values).toEqual({ A: 10, B: 5 })

    expect(result.rows[1]!.values).toEqual({ A: 7, B: 3 })
    expect(result.grandTotals).toEqual({ A: 17, B: 8 })
  })

  it("nests a 2-level hierarchy with path ids and parents rolled up from source", () => {
    const result = buildPivot({
      rows: [
        { group: "Parent", item: "Child", col: "X", v: 3 },
        { group: "Parent", item: "Child", col: "X", v: 4 },
        { group: "Parent", item: "Other", col: "X", v: 5 },
      ],
      rowGroups: ["group", "item"],
      pivotColumn: "col",
      valueField: "v",
    })

    const parent = result.rows[0]!
    expect(parent.id).toBe("Parent")
    expect(parent.depth).toBe(0)
    expect(parent.leafCount).toBe(3)
    // Rolled up from ALL descendant source rows (3 + 4 + 5), not child aggregates.
    expect(parent.values).toEqual({ X: 12 })
    expect(parent.subRows).toHaveLength(2)

    const child = parent.subRows![0]!
    expect(child.id).toBe("Parent/Child")
    expect(child.label).toBe("Child")
    expect(child.depth).toBe(1)
    expect(child.leafCount).toBe(2)
    expect(child.values).toEqual({ X: 7 })

    const other = parent.subRows![1]!
    expect(other.id).toBe("Parent/Other")
    expect(other.values).toEqual({ X: 5 })
  })

  it("computes a parent avg as a TRUE mean, not a mean-of-means", () => {
    const result = buildPivot({
      rows: [
        { g: "P", i: "C1", c: "c", v: 2 },
        { g: "P", i: "C1", c: "c", v: 2 },
        { g: "P", i: "C1", c: "c", v: 2 },
        { g: "P", i: "C2", c: "c", v: 10 },
      ],
      rowGroups: ["g", "i"],
      pivotColumn: "c",
      valueField: "v",
      aggregate: "avg",
    })

    const parent = result.rows[0]!
    // mean-of-means would be (2 + 10) / 2 = 6; true mean is 16 / 4 = 4.
    expect(parent.values).toEqual({ c: 4 })
    expect(parent.subRows![0]!.values).toEqual({ c: 2 })
    expect(parent.subRows![1]!.values).toEqual({ c: 10 })
    expect(result.grandTotals).toEqual({ c: 4 })
  })

  it("aggregates min over finite values, null when a column has no rows", () => {
    const result = buildPivot({
      rows: [
        { g: "A", c: "x", v: 5 },
        { g: "A", c: "x", v: 2 },
        { g: "A", c: "y", v: 9 },
      ],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
      aggregate: "min",
      pivotColumnOrder: ["x", "y", "z"],
    })

    expect(result.rows[0]!.values).toEqual({ x: 2, y: 9, z: null })
    expect(result.grandTotals).toEqual({ x: 2, y: 9, z: null })
  })

  it("aggregates max over finite values, null when a column has no rows", () => {
    const result = buildPivot({
      rows: [
        { g: "A", c: "x", v: 5 },
        { g: "A", c: "x", v: 2 },
      ],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
      aggregate: "max",
      pivotColumnOrder: ["x", "y"],
    })

    expect(result.rows[0]!.values).toEqual({ x: 5, y: null })
  })

  it("counts matching rows regardless of value type, and 0 (not null) for an empty match", () => {
    const result = buildPivot({
      rows: [
        { g: "A", c: "x", v: 1 },
        { g: "A", c: "x", v: "not-a-number" },
        { g: "A", c: "y", v: 3 },
      ],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
      aggregate: "count",
      pivotColumnOrder: ["x", "y", "z"],
    })

    const values = result.rows[0]!.values
    expect(values).toEqual({ x: 2, y: 1, z: 0 })
    // Count is always a number, never null.
    expect(typeof values.z).toBe("number")
    expect(result.grandTotals).toEqual({ x: 2, y: 1, z: 0 })
  })

  it("honors pivotColumnOrder verbatim: order kept, absent value all-null, unlisted dropped", () => {
    const result = buildPivot({
      rows: [
        { g: "g1", c: "A", v: 1 },
        { g: "g1", c: "B", v: 2 },
        { g: "g1", c: "C", v: 3 },
      ],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
      // C then A (order respected), Z listed-but-absent, B present-but-unlisted.
      pivotColumnOrder: ["C", "A", "Z"],
    })

    expect(result.columns.map((c) => c.id)).toEqual(["C", "A", "Z"])

    const group = result.rows[0]!
    expect(group.values).toEqual({ C: 3, A: 1, Z: null })
    // The dropped "B" leaves no cell key behind, but still counts toward leafCount.
    expect(Object.keys(group.values)).not.toContain("B")
    expect(group.leafCount).toBe(3)
    expect(result.grandTotals).toEqual({ C: 3, A: 1, Z: null })
  })

  it("orders siblings and distinct columns by first appearance", () => {
    const result = buildPivot({
      rows: [
        { g: "Zeta", c: "m", v: 1 },
        { g: "Alpha", c: "n", v: 2 },
        { g: "Zeta", c: "n", v: 3 },
      ],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
    })

    expect(result.rows.map((r) => r.label)).toEqual(["Zeta", "Alpha"])
    expect(result.columns.map((c) => c.id)).toEqual(["m", "n"])
  })

  it("tolerates missing value/group fields: null cells, an empty-string bucket, no throw", () => {
    const result = buildPivot({
      rows: [
        { g: "A", i: "x", c: "col", v: 5 },
        { g: "A", c: "col" }, // missing group field `i` and value field `v`
      ],
      rowGroups: ["g", "i"],
      pivotColumn: "c",
      valueField: "v",
    })

    const parent = result.rows[0]!
    // Only the row with a finite `v` contributes; the missing-`v` row is ignored.
    expect(parent.values).toEqual({ col: 5 })

    const labels = parent.subRows!.map((r) => r.label)
    expect(labels).toEqual(["x", ""])

    const empty = parent.subRows!.find((r) => r.label === "")!
    expect(empty.id).toBe("A/")
    expect(empty.values).toEqual({ col: null })
    expect(parent.subRows!.find((r) => r.label === "x")!.values).toEqual({
      col: 5,
    })
  })

  it("guards empty rows: no pivot rows, columns/grandTotals still derive from pivotColumnOrder", () => {
    const bare = buildPivot({
      rows: [],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
    })
    expect(bare.columns).toEqual([])
    expect(bare.rows).toEqual([])
    expect(bare.grandTotals).toEqual({})

    const ordered = buildPivot({
      rows: [],
      rowGroups: ["g"],
      pivotColumn: "c",
      valueField: "v",
      pivotColumnOrder: ["x", "y"],
    })
    expect(ordered.columns).toEqual([
      { id: "x", header: "x" },
      { id: "y", header: "y" },
    ])
    expect(ordered.rows).toEqual([])
    expect(ordered.grandTotals).toEqual({ x: null, y: null })
  })

  it("guards empty rowGroups: no rows, but columns + grandTotals still compute", () => {
    const result = buildPivot({
      rows: [
        { c: "x", v: 2 },
        { c: "x", v: 3 },
        { c: "y", v: 4 },
      ],
      rowGroups: [],
      pivotColumn: "c",
      valueField: "v",
    })

    expect(result.rows).toEqual([])
    expect(result.columns.map((c) => c.id)).toEqual(["x", "y"])
    expect(result.grandTotals).toEqual({ x: 5, y: 4 })
  })
})
