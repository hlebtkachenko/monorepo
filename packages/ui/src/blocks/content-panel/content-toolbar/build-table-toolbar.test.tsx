import { describe, expect, it, vi } from "vitest"
import type { Table } from "@tanstack/react-table"

import { buildTableToolbar } from "./build-table-toolbar"

interface Row {
  status: string
}

/** A minimal fake table exposing only what `buildTableToolbar` touches. */
function fakeTable(filterValue?: string[]) {
  const setFilterValue = vi.fn()
  const setGlobalFilter = vi.fn()
  const table = {
    setGlobalFilter,
    getColumn: (id: string) =>
      id === "status"
        ? { getFilterValue: () => filterValue, setFilterValue }
        : undefined,
  } as unknown as Table<Row>
  return { table, setFilterValue, setGlobalFilter }
}

describe("buildTableToolbar", () => {
  it("defaults the columns manager (viewTools) on with a table", () => {
    const { table } = fakeTable()
    expect(buildTableToolbar(table).viewTools).toEqual({ table })
  })

  it("omits viewTools when columnsManager is false or there is no table", () => {
    const { table } = fakeTable()
    expect(
      buildTableToolbar(table, { columnsManager: false }).viewTools,
    ).toBeUndefined()
    expect(buildTableToolbar(null).viewTools).toBeUndefined()
  })

  it("wires search onChange to setGlobalFilter", () => {
    const { table, setGlobalFilter } = fakeTable()
    const onChange = vi.fn()
    const toolbar = buildTableToolbar(table, {
      search: { value: "x", onChange },
    })
    toolbar.search?.onChange("hello")
    expect(onChange).toHaveBeenCalledWith("hello")
    expect(setGlobalFilter).toHaveBeenCalledWith("hello")
  })

  it("reads the status filter value from its delegated column", () => {
    const { table } = fakeTable(["Posted"])
    const toolbar = buildTableToolbar(table, {
      status: { columnId: "status", title: "Status", options: [] },
    })
    expect(toolbar.statusFilter?.value).toEqual(["Posted"])
    expect(toolbar.statusFilter?.columnId).toBe("status")
    expect(toolbar.statusFilter?.multiple).toBe(true)
  })

  it("clears the column filter when the status selection empties", () => {
    const { table, setFilterValue } = fakeTable(["Posted"])
    const toolbar = buildTableToolbar(table, {
      status: { columnId: "status", title: "Status", options: [] },
    })
    toolbar.statusFilter?.onChange([])
    expect(setFilterValue).toHaveBeenCalledWith(undefined)
    toolbar.statusFilter?.onChange(["New"])
    expect(setFilterValue).toHaveBeenLastCalledWith(["New"])
  })
})
