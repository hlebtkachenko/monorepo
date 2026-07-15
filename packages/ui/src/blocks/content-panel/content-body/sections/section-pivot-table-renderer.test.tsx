import { act, render, screen, fireEvent, within } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import type { Table } from "@tanstack/react-table"

import { SectionPivotTableRenderer } from "./section-pivot-table-renderer"
import type { SectionPivotTablePayload } from "./section-pivot-table"
import { SectionTableProvider, useSectionTable } from "./section-table-context"

const payload: SectionPivotTablePayload = {
  rows: [
    { region: "EU", product: "A", amount: 10 },
    { region: "EU", product: "B", amount: 5 },
    { region: "US", product: "A", amount: 7 },
  ],
  rowDimensions: [{ field: "region" }],
  columnDimensions: [],
  measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
}

const nested: SectionPivotTablePayload = {
  rows: [
    { region: "EU", country: "CZ", amount: 10 },
    { region: "EU", country: "DE", amount: 20 },
    { region: "US", country: "NY", amount: 7 },
  ],
  rowDimensions: [{ field: "region" }, { field: "country" }],
  columnDimensions: [],
  measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
}

const columnar: SectionPivotTablePayload = {
  rows: [
    { region: "EU", channel: "Online", amount: 10 },
    { region: "EU", channel: "Retail", amount: 5 },
    { region: "US", channel: "Online", amount: 7 },
  ],
  rowDimensions: [{ field: "region" }],
  columnDimensions: [{ field: "channel", label: "Channel" }],
  measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
}

function renderPivot(p: SectionPivotTablePayload) {
  return render(
    <div className="flex h-96 flex-col">
      <SectionPivotTableRenderer props={p} />
    </div>,
  )
}

describe("SectionPivotTableRenderer", () => {
  it("renders the row groups and the measure header", () => {
    renderPivot(payload)
    expect(screen.getByText("EU")).toBeInTheDocument()
    expect(screen.getByText("US")).toBeInTheDocument()
    // No column dims → the measure label is the only value header.
    expect(screen.getByRole("button", { name: /Amount/ })).toBeInTheDocument()
  })

  it("drills a value cell into its underlying source rows", () => {
    const onPivotDrill = vi.fn()
    render(
      <SectionTableProvider onPivotDrill={onPivotDrill}>
        <div className="flex h-96 flex-col">
          <SectionPivotTableRenderer props={payload} />
        </div>
      </SectionTableProvider>,
    )
    // EU subtotal Amount = 15 (10 + 5); the cell is a drill button when wired.
    const button = screen.getByText("15").closest("button")
    expect(button).not.toBeNull()
    fireEvent.click(button as HTMLButtonElement)
    expect(onPivotDrill).toHaveBeenCalledTimes(1)
    const target = onPivotDrill.mock.calls[0]![0]
    expect(target.rowValues).toEqual({ region: "EU" })
    expect(target.measureId).toBe("amt")
    // Only the two EU source rows contribute to the cell.
    expect(target.rows).toHaveLength(2)
    expect(
      target.rows.every((r: { region: string }) => r.region === "EU"),
    ).toBe(true)
  })

  it("leaves pivot cells inert (no drill button) when no handler is wired", () => {
    // `renderPivot` mounts the renderer with NO SectionTableProvider, so the
    // drill bridge is null and value cells are plain (non-button) numbers.
    renderPivot(payload)
    expect(screen.getByText("15").closest("button")).toBeNull()
  })

  it("renders hierarchical column headers (a grouping tier per column dimension)", () => {
    const { container } = renderPivot(columnar)
    // Two header tiers: the channel grouping band above the measure leaf row.
    expect(
      container.querySelectorAll('[data-slot="grid-header-row"]'),
    ).toHaveLength(2)
    // The column-dimension values head the upper (grouping) tier as ordinary
    // header cells on the neutral header surface (no separate blue group tint —
    // the tier is distinguished by its span + the group-edge divider, not colour).
    const online = screen.getByText("Online")
    expect(screen.getByText("Retail")).toBeInTheDocument()
    const onlineCell = online.closest(
      '[data-slot="grid-header-cell"]',
    )?.className
    expect(onlineCell).toContain("bg-grid-header")
    expect(onlineCell).not.toContain("bg-grid-header-group")
    // Online is a NON-last group → its right edge is the full-strength group
    // divider (`border-border-subtle`, not the faint `/60` inner hairline).
    expect(onlineCell).toContain("border-e border-border-subtle")
    expect(onlineCell).not.toContain("border-border-subtle/60")
  })

  it("puts the grand total in a footer rowgroup, outside the body rows", () => {
    const { container } = renderPivot(payload)
    const footer = container.querySelector('[data-slot="grid-footer"]')
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).getByText("Total")).toBeInTheDocument()
    // Grand total 22 lives only in the footer; body shows the subtotals 15 / 7.
    expect(within(footer as HTMLElement).getByText("22")).toBeInTheDocument()
    const body = container.querySelector(
      '[data-slot="grid-body"]',
    ) as HTMLElement
    expect(within(body).queryByText("22")).toBeNull()
    expect(within(body).getByText("15")).toBeInTheDocument()
    expect(within(body).getByText("7")).toBeInTheDocument()
  })

  it("expands the hierarchy by default (subrows visible)", () => {
    renderPivot(nested)
    // defaultExpanded → the country subrows show without a click.
    expect(screen.getByText("CZ")).toBeInTheDocument()
    expect(screen.getByText("DE")).toBeInTheDocument()
  })

  it("collapses a group when its toggle is clicked", () => {
    renderPivot(nested)
    fireEvent.click(screen.getByRole("button", { name: /Collapse EU/ }))
    expect(screen.queryByText("CZ")).not.toBeInTheDocument()
    expect(screen.getByText("US")).toBeInTheDocument() // sibling stays
  })

  it("sorts groups by a measure value (TanStack sort over the value accessor)", () => {
    const ref: { current: Table<unknown> | null } = { current: null }
    function Capture() {
      const reg = useSectionTable()
      if (reg?.table) ref.current = reg.table
      return null
    }
    const { container } = render(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionPivotTableRenderer props={payload} />
        </div>
        <Capture />
      </SectionTableProvider>,
    )
    // col 0 is the shared select column (line number); the row-label hierarchy
    // is col 1.
    const bodyRowLabels = () =>
      Array.from(
        container.querySelectorAll('[data-slot="grid-row"] [data-col="1"]'),
      ).map((c) => c.textContent)
    // EU (15) before US (7) by first-seen.
    expect(bodyRowLabels()).toEqual(["EU", "US"])
    // The single measure leaf is "val0". Sorting is TanStack's own
    // getSortedRowModel over the value accessor — nothing re-implemented here.
    act(() => ref.current!.setSorting([{ id: "val0", desc: false }]))
    expect(bodyRowLabels()).toEqual(["US", "EU"]) // 7 before 15
  })

  it("routes a value column's Filter to the toolbar filter for its measure field", () => {
    const ref: { current: Table<unknown> | null } = { current: null }
    function Capture() {
      const reg = useSectionTable()
      if (reg?.table) ref.current = reg.table
      return null
    }
    render(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionPivotTableRenderer props={payload} />
        </div>
        <Capture />
      </SectionTableProvider>,
    )
    // No inline filter on the value column: its "Filter" routes to the TOOLBAR,
    // keyed by the measure's FIELD ("amount"), so every Amount column across every
    // group opens the SAME one filter.
    expect(ref.current!.getColumn("val0")!.columnDef.meta?.filterColumnId).toBe(
      "amount",
    )
  })

  it("renders the empty state and no total for an empty pivot", () => {
    const { container } = renderPivot({
      ...payload,
      rows: [],
      emptyText: "None.",
    })
    expect(screen.getByText("None.")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="grid-footer"]')).toBeNull()
  })

  it("shows a loading state instead of the grid", () => {
    const { container } = renderPivot({ ...payload, state: "loading" })
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })
})
