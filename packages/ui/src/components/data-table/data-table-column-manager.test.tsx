import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"

import { ColumnManagerMenuContent } from "./data-table-column-manager"

interface Row {
  a: string
  b: string
}
const columns: ColumnDef<Row>[] = [
  { accessorKey: "a", header: "Alpha", meta: { label: "Alpha" } },
  { accessorKey: "b", header: "Beta", meta: { label: "Beta" } },
]
function Harness() {
  const table = useReactTable<Row>({
    data: [{ a: "1", b: "2" }],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return <ColumnManagerMenuContent table={table} />
}

/** Harness exposing column "a"'s live size + the live column order + controls to
 * mutate both, so the reset action (sizes AND placing) is verified end-to-end. */
function SizeHarness() {
  const table = useReactTable<Row>({
    data: [{ a: "1", b: "2" }],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <div>
      <span data-testid="size-a">{table.getColumn("a")!.getSize()}</span>
      <span data-testid="order">{table.getState().columnOrder.join(",")}</span>
      <button type="button" onClick={() => table.setColumnSizing({ a: 321 })}>
        grow
      </button>
      <button type="button" onClick={() => table.setColumnOrder(["b", "a"])}>
        reorder
      </button>
      <ColumnManagerMenuContent table={table} />
    </div>
  )
}

/** A table with a GROUP column (a pivot high-level header spanning two leaves),
 * exposing each leaf's live visibility so the group-cascade toggle is verifiable. */
function GroupHarness() {
  const table = useReactTable<Row>({
    data: [{ a: "1", b: "2" }],
    columns: [
      {
        id: "channel",
        header: "Channel",
        enableHiding: true,
        columns: [
          { accessorKey: "a", header: "A", meta: { label: "Alpha" } },
          { accessorKey: "b", header: "B", meta: { label: "Beta" } },
        ],
      },
    ] as ColumnDef<Row>[],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <div>
      <span data-testid="a-visible">
        {String(table.getColumn("a")!.getIsVisible())}
      </span>
      <span data-testid="b-visible">
        {String(table.getColumn("b")!.getIsVisible())}
      </span>
      <ColumnManagerMenuContent table={table} />
    </div>
  )
}

/** A pivot-like table: two high-level groups, each with an "Orders" measure leaf
 * (same label) — the manager must dedup them into ONE low-level switch. */
function PivotLikeHarness() {
  const table = useReactTable<Row>({
    data: [{ a: "1", b: "2" }],
    columns: [
      {
        id: "online",
        header: "Online",
        enableHiding: true,
        columns: [
          { id: "o1", accessorFn: (r) => r.a, header: "x", meta: { label: "Orders" } }, // prettier-ignore
        ],
      },
      {
        id: "retail",
        header: "Retail",
        enableHiding: true,
        columns: [
          { id: "o2", accessorFn: (r) => r.b, header: "y", meta: { label: "Orders" } }, // prettier-ignore
        ],
      },
    ] as ColumnDef<Row>[],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <div>
      <span data-testid="o1-visible">
        {String(table.getColumn("o1")!.getIsVisible())}
      </span>
      <span data-testid="o2-visible">
        {String(table.getColumn("o2")!.getIsVisible())}
      </span>
      <ColumnManagerMenuContent table={table} />
    </div>
  )
}

interface Row6 {
  a: string
  b: string
  c: string
  d: string
  e: string
  f: string
}
const columns6: ColumnDef<Row6>[] = [
  { accessorKey: "a", header: "A", meta: { label: "Alpha" } },
  { accessorKey: "b", header: "B", meta: { label: "Beta" } },
  { accessorKey: "c", header: "C", meta: { label: "Gamma" } },
  { accessorKey: "d", header: "D", meta: { label: "Delta" } },
  { accessorKey: "e", header: "E", meta: { label: "Epsilon" } },
  { accessorKey: "f", header: "F", meta: { label: "Zeta" } },
]
function PinningHarness({
  columnOrder,
  columnPinning,
}: {
  columnOrder: string[]
  columnPinning: { left?: string[]; right?: string[] }
}) {
  const table = useReactTable<Row6>({
    data: [{ a: "1", b: "2", c: "3", d: "4", e: "5", f: "6" }],
    columns: columns6,
    getCoreRowModel: getCoreRowModel(),
    initialState: { columnOrder, columnPinning },
  })
  return <ColumnManagerMenuContent table={table} />
}

/** Row labels in DOM order, derived from each row's Hide/Show aria-label. */
function renderedLabels() {
  return screen
    .getAllByRole("button", { name: /Hide|Show/ })
    .map((el) => el.getAttribute("aria-label")?.replace(/^(Hide|Show) /, ""))
}

describe("ColumnManagerMenuContent", () => {
  it("renders no nested <button> (button-in-button crashes hydration)", () => {
    // Regression: the row toggle was a real <button> wrapping the Radix
    // Checkbox (also a <button>). The visibility indicator must stay
    // non-interactive so nothing nests inside the row's role="button".
    const { container } = render(<Harness />)
    expect(container.querySelectorAll("button button")).toHaveLength(0)
    expect(screen.getAllByRole("button", { name: /Hide|Show/ })).toHaveLength(2)
  })

  it("toggles a column's visibility on click", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Hide Alpha" }))
    expect(
      screen.getByRole("button", { name: "Show Alpha" }),
    ).toBeInTheDocument()
  })

  it("toggles via keyboard (Enter)", () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Hide Beta" }), {
      key: "Enter",
    })
    expect(
      screen.getByRole("button", { name: "Show Beta" }),
    ).toBeInTheDocument()
  })

  it("resets the column layout (sizes AND placing) to their defaults", () => {
    render(<SizeHarness />)
    const size = () => screen.getByTestId("size-a").textContent
    const order = () => screen.getByTestId("order").textContent
    const originalSize = size()
    fireEvent.click(screen.getByRole("button", { name: "grow" }))
    fireEvent.click(screen.getByRole("button", { name: "reorder" }))
    expect(size()).toBe("321")
    expect(order()).toBe("b,a")
    fireEvent.click(screen.getByRole("button", { name: "Reset column layout" }))
    // Both the widened size AND the reordered placing snap back to defaults.
    expect(size()).toBe(originalSize)
    expect(order()).toBe("")
  })

  it("orders the pinned-left group by columnPinning.left, not columnOrder", () => {
    // columnOrder puts "b" before "a", but columnPinning.left says "a" then
    // "b" — the manager must follow the pinning array for the pinned group.
    render(
      <PinningHarness
        columnOrder={["f", "e", "b", "a", "d", "c"]}
        columnPinning={{ left: ["a", "b"] }}
      />,
    )
    const labels = renderedLabels()
    // Pinned-left rows render first, in columnPinning.left order.
    expect(labels.slice(0, 2)).toEqual(["Alpha", "Beta"])
  })

  it("orders the pinned-right group by columnPinning.right, not columnOrder", () => {
    // columnOrder puts "c" before "d", but columnPinning.right says "d" then
    // "c" — the manager must follow the pinning array for the pinned group.
    render(
      <PinningHarness
        columnOrder={["a", "b", "c", "d", "e", "f"]}
        columnPinning={{ right: ["d", "c"] }}
      />,
    )
    const labels = renderedLabels()
    // No pinned-left group here, so pinned-right rows render first.
    expect(labels.slice(0, 2)).toEqual(["Delta", "Gamma"])
  })

  it("keeps unpinned columns ordered by columnOrder", () => {
    // "e" and "f" are absent from columnOrder, so they fall back to
    // definition order and sort after the explicitly ordered columns.
    render(
      <PinningHarness columnOrder={["c", "a", "d", "b"]} columnPinning={{}} />,
    )
    expect(renderedLabels()).toEqual([
      "Gamma",
      "Alpha",
      "Delta",
      "Beta",
      "Epsilon",
      "Zeta",
    ])
  })

  it("keeps pinned and unpinned groups disjoint and matches full expected order", () => {
    // a,b pinned left (in reverse of columnOrder); c,d pinned right (in
    // reverse of columnOrder); e,f unpinned, following columnOrder.
    render(
      <PinningHarness
        columnOrder={["b", "a", "c", "d", "f", "e"]}
        columnPinning={{ left: ["a", "b"], right: ["d", "c"] }}
      />,
    )
    expect(renderedLabels()).toEqual([
      "Alpha",
      "Beta",
      "Delta",
      "Gamma",
      "Zeta",
      "Epsilon",
    ])
  })

  it("dedups a reused measure into ONE low-level switch hiding it under every group", () => {
    render(<PivotLikeHarness />)
    expect(screen.getByTestId("o1-visible").textContent).toBe("true")
    // Exactly one "Orders" low-level switch, not one per group.
    const orders = screen.getAllByRole("button", { name: /Orders/ })
    expect(orders).toHaveLength(1)
    fireEvent.click(orders[0]!)
    // Toggling it hides the Orders leaf under BOTH groups.
    expect(screen.getByTestId("o1-visible").textContent).toBe("false")
    expect(screen.getByTestId("o2-visible").textContent).toBe("false")
  })

  it("cascades a group (pivot high-level) column's hide toggle to its leaves", () => {
    // TanStack's own toggleVisibility does NOT cascade from a group to its
    // leaves, which left the pivot columns manager toggling a no-op. The manager
    // must hide every leaf under the group.
    render(<GroupHarness />)
    expect(screen.getByTestId("a-visible").textContent).toBe("true")
    expect(screen.getByTestId("b-visible").textContent).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Hide Channel" }))
    expect(screen.getByTestId("a-visible").textContent).toBe("false")
    expect(screen.getByTestId("b-visible").textContent).toBe("false")
  })
})
