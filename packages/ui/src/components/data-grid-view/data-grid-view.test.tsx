import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"
import { arrayMove } from "@dnd-kit/sortable"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { Checkbox } from "@workspace/ui/components/checkbox"

import { useDataTable } from "../data-table/use-data-table"
import { DataGridView } from "./data-grid-view"
import { commitCenter, getCenterIds } from "./data-grid-view-column-header"

interface Row {
  id: string
  name: string
  age: number
}

const seed: Row[] = [
  { id: "1", name: "Ada", age: 36 },
  { id: "2", name: "Alan", age: 41 },
  { id: "3", name: "Grace", age: 85 },
]

const columns: ColumnDef<Row>[] = [
  {
    id: "select",
    size: 40,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    header: () => <Checkbox aria-label="Select all" />,
    cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.name}`} />,
  },
  { accessorKey: "name", header: "Name", size: 160, meta: { label: "Name" } },
  { accessorKey: "age", header: "Age", size: 120, meta: { label: "Age" } },
]

function Harness() {
  const { table } = useDataTable<Row>({
    data: seed,
    columns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    initialState: { columnPinning: { left: ["select"] } },
  })
  return <DataGridView table={table} className="h-64" />
}

function dataRowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="grid-row"]')).map(
    (row) => {
      const cell = row.querySelector('[data-slot="grid-cell"][data-col="1"]')
      return cell?.textContent ?? ""
    },
  )
}

describe("DataGridView", () => {
  it("renders the column headers and a row per item", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Age/ })).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Alan")).toBeInTheDocument()
    expect(screen.getByText("Grace")).toBeInTheDocument()
  })

  it("moves cell focus with the arrow keys", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const adaCell = screen.getByText("Ada").closest('[role="gridcell"]')
    expect(adaCell).not.toBeNull()
    await user.click(adaCell as HTMLElement)
    expect(adaCell).toHaveFocus()

    await user.keyboard("{ArrowDown}")
    expect(document.activeElement?.textContent).toBe("Alan")
  })

  it("sorts from the header menu (and stays on the shared table)", async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)

    expect(dataRowNames(container)).toEqual(["Ada", "Alan", "Grace"])

    await user.click(screen.getByRole("button", { name: /Name/ }))
    await user.click(
      await screen.findByRole("menuitem", { name: /Sort descending/ }),
    )

    expect(dataRowNames(container)).toEqual(["Grace", "Alan", "Ada"])
  })

  it("hides a column from the header menu", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole("button", { name: /Age/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Age/ }))
    await user.click(
      await screen.findByRole("menuitem", { name: /Hide column/ }),
    )

    expect(
      screen.queryByRole("button", { name: /Age/ }),
    ).not.toBeInTheDocument()
  })
})

describe("column reorder (shared columnOrder helpers)", () => {
  it("moves a centre column while keeping the pinned column at the edge", () => {
    const { result } = renderHook(() =>
      useDataTable<Row>({
        data: seed,
        columns,
        getRowId: (row) => row.id,
        columnResizeMode: "onChange",
        initialState: { columnPinning: { left: ["select"] } },
      }),
    )
    const table = result.current.table
    // The centre (non-pinned) group, in order; `select` is pinned out of it.
    expect(getCenterIds(table)).toEqual(["name", "age"])

    const center = getCenterIds(table)
    act(() => commitCenter(table, arrayMove(center, 0, 1)))

    // Centre reordered, pinned `select` still leads the full order.
    expect(getCenterIds(result.current.table)).toEqual(["age", "name"])
    expect(result.current.table.getState().columnOrder[0]).toBe("select")
  })
})
