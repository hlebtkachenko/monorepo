import { act, render, screen, fireEvent, within } from "@testing-library/react"
import { describe, it, expect } from "vitest"
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

  it("renders hierarchical column headers (a grouping tier per column dimension)", () => {
    const { container } = renderPivot(columnar)
    // Two header tiers: the channel grouping band above the measure leaf row.
    expect(
      container.querySelectorAll('[data-slot="grid-header-row"]'),
    ).toHaveLength(2)
    // The column-dimension values head the upper (grouping) tier, tinted with
    // the group-layer token.
    const online = screen.getByText("Online")
    expect(screen.getByText("Retail")).toBeInTheDocument()
    expect(
      online.closest('[data-slot="grid-header-cell"]')?.className,
    ).toContain("bg-grid-header-group")
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
