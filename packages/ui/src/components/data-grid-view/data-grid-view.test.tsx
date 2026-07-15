import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  getExpandedRowModel,
  type ColumnDef,
  type Table,
} from "@tanstack/react-table"
import { arrayMove } from "@dnd-kit/sortable"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { Checkbox } from "@workspace/ui/components/checkbox"

import { useDataTable } from "../data-table/use-data-table"
import { DataGridView, type DataGridSummaryRow } from "./data-grid-view"
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

  it("stacks the sticky header above the focused-row layer (D6A)", () => {
    // The sticky header must sit above any body focus/selection layer (rows use
    // `z-20`) so a focused row can never paint over it when scrolled.
    const { container } = render(<Harness />)
    const header = container.querySelector('[data-slot="grid-header"]')
    expect(header?.className).toContain("z-30")
  })

  it("right-aligns a SORTABLE column header when meta.align is 'end'", () => {
    // Sortable/hideable columns render through DataGridViewColumnHeader (a
    // dropdown trigger), not the non-interactive branch — so its trigger must
    // also honor meta.align, else numeric headers sit left over right cells.
    function AlignHarness() {
      const { table } = useDataTable<Row>({
        data: seed,
        columns: [
          {
            accessorKey: "name",
            header: "Name",
            size: 160,
            meta: { label: "Name" },
          },
          {
            accessorKey: "age",
            header: "Age",
            size: 120,
            meta: { label: "Age", align: "end" },
          },
        ],
        getRowId: (row) => row.id,
        columnResizeMode: "onChange",
      })
      return <DataGridView table={table} className="h-64" />
    }
    render(<AlignHarness />)
    expect(screen.getByRole("button", { name: /Age/ }).className).toContain(
      "justify-end",
    )
  })

  it("switches to windowed rendering above the row threshold", () => {
    // Above VIRTUALIZE_THRESHOLD (100) the body becomes a positioned scroll
    // container. aria-rowcount still reflects EVERY row (not just the window),
    // so assistive tech knows the true size.
    const many: Row[] = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      name: `Name ${i}`,
      age: i,
    }))
    function BigHarness() {
      const { table } = useDataTable<Row>({
        data: many,
        columns,
        getRowId: (row) => row.id,
        columnResizeMode: "onChange",
        // Single page holds all rows (the archetype's "1-pager" model) so the
        // grid receives every row and virtualizes them.
        initialState: {
          columnPinning: { left: ["select"] },
          pagination: { pageIndex: 0, pageSize: 1000 },
        },
      })
      return <DataGridView table={table} className="h-64" />
    }
    const { container } = render(<BigHarness />)
    expect(
      container.querySelector('[role="grid"]')?.getAttribute("aria-rowcount"),
    ).toBe("151")
    const body = container.querySelector<HTMLElement>('[data-slot="grid-body"]')
    expect(body?.style.position).toBe("relative")
  })

  it("gives dnd-kit a stable id so the grips don't mismatch on hydration", () => {
    // dnd-kit's default aria-describedby is a MODULE-COUNTER id
    // ("DndDescribedBy-0") that differs between the SSR render and the client
    // hydration → a hydration mismatch. The DndContext must get a React
    // SSR-stable useId instead, so the id is never the counter form.
    render(<Harness />)
    const grips = screen.getAllByRole("button", {
      name: "Drag to reorder column",
    })
    expect(grips.length).toBeGreaterThan(0)
    for (const grip of grips) {
      const describedBy = grip.getAttribute("aria-describedby")
      expect(describedBy).toBeTruthy()
      expect(describedBy).not.toMatch(/^DndDescribedBy-\d+$/)
    }
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

describe("header alignment (meta.align)", () => {
  // Both columns are non-interactive (no sort, no hide) so the header goes
  // through SortableHeaderCell's plain content div rather than
  // DataGridViewColumnHeader — the latter doesn't consult `meta.align`.
  const alignedColumns: ColumnDef<Row>[] = [
    {
      accessorKey: "name",
      header: "Name",
      size: 160,
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Name" },
    },
    {
      accessorKey: "age",
      header: "Age",
      size: 120,
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Age", align: "end" },
    },
  ]

  function AlignHarness() {
    const { table } = useDataTable<Row>({
      data: seed,
      columns: alignedColumns,
      getRowId: (row) => row.id,
      columnResizeMode: "onChange",
    })
    return <DataGridView table={table} className="h-64" />
  }

  it("right-aligns the header content for an end-aligned column", () => {
    render(<AlignHarness />)
    const header = screen.getByText("Age")
    expect(header.className).toContain("justify-end")
    expect(header.className).toContain("px-3")
  })

  it("keeps the default (start) header left-aligned", () => {
    render(<AlignHarness />)
    const header = screen.getByText("Name")
    expect(header.className).not.toContain("justify-end")
    expect(header.className).not.toContain("justify-center")
    expect(header.className).toContain("px-3")
  })
})

describe("summary row (grand-total footer, C3)", () => {
  const summary: DataGridSummaryRow = {
    ariaLabel: "Grand total",
    cells: {
      select: null,
      name: <span>Total</span>,
      age: <span>Σ 162</span>,
    },
  }

  function SummaryHarness({
    tableRef,
    withSummary = true,
  }: {
    tableRef?: { current: Table<Row> | null }
    withSummary?: boolean
  }) {
    const { table } = useDataTable<Row>({
      data: seed,
      columns,
      getRowId: (row) => row.id,
      columnResizeMode: "onChange",
      // The archetype's single-page model; the footer coexists with virtualization.
      paginated: false,
      enableGlobalFilter: true,
      globalFilterFn: "includesString",
      initialState: { columnPinning: { left: ["select"] } },
    })
    if (tableRef) tableRef.current = table
    return (
      <DataGridView
        table={table}
        className="h-64"
        summaryRow={withSummary ? summary : null}
      />
    )
  }

  const lastRowGroup = (container: HTMLElement) => {
    const groups = container.querySelectorAll('[role="rowgroup"]')
    return groups[groups.length - 1]
  }

  it("renders the total in a footer rowgroup, outside the body", () => {
    const { container } = render(<SummaryHarness />)
    const footer = container.querySelector('[data-slot="grid-footer"]')
    expect(footer).not.toBeNull()
    expect(footer).toHaveTextContent("Total")
    expect(footer).toHaveTextContent("Σ 162")
    // The body row model never carries the total.
    const body = container.querySelector('[data-slot="grid-body"]')
    expect(body?.textContent ?? "").not.toContain("Σ 162")
  })

  it("keeps the footer last + visible after ascending then descending sort", () => {
    const tableRef: { current: Table<Row> | null } = { current: null }
    const { container } = render(<SummaryHarness tableRef={tableRef} />)

    act(() => tableRef.current!.setSorting([{ id: "age", desc: false }]))
    expect(lastRowGroup(container)?.getAttribute("data-slot")).toBe(
      "grid-footer",
    )
    expect(lastRowGroup(container)).toHaveTextContent("Total")

    act(() => tableRef.current!.setSorting([{ id: "age", desc: true }]))
    expect(lastRowGroup(container)?.getAttribute("data-slot")).toBe(
      "grid-footer",
    )
    expect(lastRowGroup(container)).toHaveTextContent("Total")
  })

  it("keeps the footer visible after a filter drops body rows", () => {
    const tableRef: { current: Table<Row> | null } = { current: null }
    const { container } = render(<SummaryHarness tableRef={tableRef} />)

    act(() => tableRef.current!.setGlobalFilter("Ada"))
    expect(dataRowNames(container)).toEqual(["Ada"])
    expect(
      container.querySelector('[data-slot="grid-footer"]'),
    ).toHaveTextContent("Total")
  })

  it("counts the footer in aria-rowcount but not the selected-row model", () => {
    const tableRef: { current: Table<Row> | null } = { current: null }
    const { container } = render(<SummaryHarness tableRef={tableRef} />)

    // header (1) + 3 body + 1 summary = 5.
    expect(
      container.querySelector('[role="grid"]')?.getAttribute("aria-rowcount"),
    ).toBe("5")

    act(() => tableRef.current!.toggleAllRowsSelected(true))
    // Selecting every data row yields the 3 data rows only — never the total.
    expect(tableRef.current!.getFilteredSelectedRowModel().rows).toHaveLength(3)
  })

  it("renders no footer (and no extra aria-rowcount) without a summaryRow", () => {
    const { container } = render(<SummaryHarness withSummary={false} />)
    expect(container.querySelector('[data-slot="grid-footer"]')).toBeNull()
    expect(
      container.querySelector('[role="grid"]')?.getAttribute("aria-rowcount"),
    ).toBe("4")
  })
})

describe("row-level aria-expanded", () => {
  interface TreeRow {
    id: string
    name: string
    children?: TreeRow[]
  }

  const treeData: TreeRow[] = [
    { id: "1", name: "Parent", children: [{ id: "1a", name: "Child" }] },
    { id: "2", name: "Leaf" },
  ]

  const treeColumns: ColumnDef<TreeRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      size: 200,
      meta: { label: "Name" },
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <button type="button" onClick={row.getToggleExpandedHandler()}>
            {row.original.name}
          </button>
        ) : (
          row.original.name
        ),
    },
  ]

  function TreeHarness() {
    const { table } = useDataTable<TreeRow>({
      data: treeData,
      columns: treeColumns,
      getRowId: (row) => row.id,
      getSubRows: (row) => row.children,
      getExpandedRowModel: getExpandedRowModel(),
      columnResizeMode: "onChange",
    })
    return <DataGridView table={table} className="h-64" />
  }

  it("exposes expand state on rows that can expand, omits it on plain rows", async () => {
    const user = userEvent.setup()
    render(<TreeHarness />)

    const parentRow = screen.getByText("Parent").closest('[role="row"]')
    const leafRow = screen.getByText("Leaf").closest('[role="row"]')
    expect(parentRow).toHaveAttribute("aria-expanded", "false")
    expect(leafRow).not.toHaveAttribute("aria-expanded")

    await user.click(screen.getByRole("button", { name: "Parent" }))
    expect(parentRow).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Child")).toBeInTheDocument()
  })
})
