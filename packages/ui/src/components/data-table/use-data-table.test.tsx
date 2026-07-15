import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"
import type { ColumnDef } from "@tanstack/react-table"

import { useDataTable } from "./use-data-table"

interface Row {
  a: number
  b: number
}
const columns: ColumnDef<Row>[] = [
  { accessorKey: "a", header: "A" },
  { accessorKey: "b", header: "B" },
]
const data: Row[] = [{ a: 1, b: 2 }]

describe("useDataTable layout persistence", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("writes column order + pinning to localStorage under the key", () => {
    const key = "afframe.table.persist-write"
    const { result } = renderHook(() =>
      useDataTable<Row>({ data, columns, persistenceKey: key }),
    )
    // First (mount) write is intentionally skipped, so nothing is stored yet.
    expect(window.localStorage.getItem(key)).toBeNull()

    act(() => result.current.table.setColumnOrder(["b", "a"]))

    const saved = JSON.parse(window.localStorage.getItem(key)!)
    expect(saved.columnOrder).toEqual(["b", "a"])
  })

  it("rehydrates the saved layout on mount", () => {
    const key = "afframe.table.persist-hydrate"
    window.localStorage.setItem(
      key,
      JSON.stringify({
        columnOrder: ["b", "a"],
        columnPinning: { left: ["a"], right: [] },
      }),
    )
    const { result } = renderHook(() =>
      useDataTable<Row>({ data, columns, persistenceKey: key }),
    )
    expect(result.current.table.getState().columnOrder).toEqual(["b", "a"])
    expect(result.current.table.getState().columnPinning.left).toEqual(["a"])
  })

  it("drops saved ids that no longer exist as columns", () => {
    const key = "afframe.table.persist-stale"
    window.localStorage.setItem(
      key,
      JSON.stringify({ columnOrder: ["b", "ghost", "a"] }),
    )
    const { result } = renderHook(() =>
      useDataTable<Row>({ data, columns, persistenceKey: key }),
    )
    expect(result.current.table.getState().columnOrder).toEqual(["b", "a"])
  })

  it("does not touch storage when no key is given", () => {
    const { result } = renderHook(() => useDataTable<Row>({ data, columns }))
    act(() => result.current.table.setColumnOrder(["b", "a"]))
    expect(window.localStorage.length).toBe(0)
  })
})

describe("useDataTable single-page mode (C3)", () => {
  it("installs no pagination row model in single-page mode; the default keeps it", () => {
    const { result: single } = renderHook(() =>
      useDataTable<Row>({ data, columns, paginated: false }),
    )
    // The hidden pagination workaround is gone: no page row model is wired.
    expect(single.current.table.options.getPaginationRowModel).toBeUndefined()

    const { result: paged } = renderHook(() =>
      useDataTable<Row>({ data, columns }),
    )
    expect(typeof paged.current.table.options.getPaginationRowModel).toBe(
      "function",
    )
  })

  it("keeps 100k+ rows in the row model (no page truncation); default windows to one page", () => {
    const many: Row[] = Array.from({ length: 120_000 }, (_, i) => ({
      a: i,
      b: i,
    }))
    const { result: single } = renderHook(() =>
      useDataTable<Row>({ data: many, columns, paginated: false }),
    )
    expect(single.current.table.getRowModel().rows).toHaveLength(120_000)

    // The default (paginated) mode windows the SAME data to one page (size 10).
    const { result: paged } = renderHook(() =>
      useDataTable<Row>({ data: many, columns }),
    )
    expect(paged.current.table.getRowModel().rows).toHaveLength(10)
  })

  it("sorts over the complete dataset, not a single page", () => {
    const many: Row[] = Array.from({ length: 120_000 }, (_, i) => ({
      a: i,
      b: i,
    }))
    const { result } = renderHook(() =>
      useDataTable<Row>({ data: many, columns, paginated: false }),
    )
    act(() => result.current.table.setSorting([{ id: "a", desc: true }]))
    // The descending top row is the GLOBAL max (119_999); reachable only if the
    // sort saw every row — a truncated page would top out far lower.
    expect(result.current.table.getRowModel().rows[0]!.original.a).toBe(119_999)
  })
})
