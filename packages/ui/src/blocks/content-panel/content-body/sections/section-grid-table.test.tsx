import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import type { Table } from "@tanstack/react-table"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionTable, type TableColumnSpec } from "./section-table"
import { SectionTableRenderer } from "./section-table-renderer"
import { SectionPivotTableRenderer } from "./section-pivot-table-renderer"
import type { SectionPivotTablePayload } from "./section-pivot-table"
import { SectionTableProvider, useSectionTable } from "./section-table-context"

/**
 * Characterization tests for the mandatory Table-section grid scaffold (C2) —
 * the behavior that BOTH the flat and pivot renderers must share through one
 * seam: live-instance registration through the section bridge, the published
 * `selectionCount`, and the single-page (never-truncated) row model. These lock
 * the observable contract so the shared-hook extraction cannot drift it.
 */

const COLUMNS: TableColumnSpec[] = [
  { id: "doc", header: "Document", kind: "text" },
  { id: "amount", header: "Amount", kind: "number" },
]

const ROWS = [
  { id: "1", doc: "FP-001", amount: 100 },
  { id: "2", doc: "FP-002", amount: 200 },
]

/** Reflects the bridge registration: whether a table registered + its count. */
function RegistrationProbe() {
  const reg = useSectionTable()
  return (
    <div data-testid="reg">
      {reg ? `registered:${reg.selectionCount}` : "none"}
    </div>
  )
}

/** Captures the live table the renderer publishes so a test can drive it. */
function renderFlatWithTable(props: ReturnType<typeof sectionTable>["props"]) {
  const tableRef: { current: Table<unknown> | null } = { current: null }
  function Capture() {
    const reg = useSectionTable()
    if (reg?.table) tableRef.current = reg.table
    return null
  }
  const utils = render(
    <SectionTableProvider>
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={props} />
      </div>
      <RegistrationProbe />
      <Capture />
    </SectionTableProvider>,
    { wrapper: IconProvider },
  )
  return { ...utils, tableRef }
}

describe("section grid scaffold — flat (characterization)", () => {
  it("registers the live table through the bridge", () => {
    renderFlatWithTable(
      sectionTable({ rowIdKey: "id", columns: COLUMNS, rows: ROWS }).props,
    )
    expect(screen.getByTestId("reg")).toHaveTextContent("registered:0")
  })

  it("publishes a selection count that tracks row selection", async () => {
    renderFlatWithTable(
      sectionTable({ rowIdKey: "id", columns: COLUMNS, rows: ROWS }).props,
    )
    expect(screen.getByTestId("reg")).toHaveTextContent("registered:0")
    fireEvent.click(screen.getByLabelText("Select row 1"))
    await waitFor(() =>
      expect(screen.getByTestId("reg")).toHaveTextContent("registered:1"),
    )
  })

  it("shows the empty-state message when there are no rows", () => {
    render(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer
          props={
            sectionTable({
              rowIdKey: "id",
              columns: COLUMNS,
              rows: [],
              emptyText: "No invoices.",
            }).props
          }
        />
      </div>,
      { wrapper: IconProvider },
    )
    expect(screen.getByText("No invoices.")).toBeInTheDocument()
  })

  it("keeps every row in a single-page model past the virtualization threshold", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      id: String(i),
      doc: `FP-${i}`,
      amount: i,
    }))
    const { tableRef } = renderFlatWithTable(
      sectionTable({ rowIdKey: "id", columns: COLUMNS, rows }).props,
    )
    await waitFor(() => expect(tableRef.current).not.toBeNull())
    // No hidden page size truncates the model — all 250 rows are present even
    // though the DOM is virtualized.
    expect(tableRef.current!.getRowModel().rows).toHaveLength(250)
  })
})

const pivotPayload: SectionPivotTablePayload = {
  rows: [
    { region: "North", product: "A", amount: 10 },
    { region: "South", product: "A", amount: 7 },
  ],
  rowDimensions: [{ field: "region" }],
  columnDimensions: [{ field: "product" }],
  measures: [{ id: "amt", label: "Amount", agg: "sum", field: "amount" }],
}

describe("section grid scaffold — pivot (characterization)", () => {
  it("registers the live table and ships the shared select column", async () => {
    const tableRef: { current: Table<unknown> | null } = { current: null }
    function Capture() {
      const reg = useSectionTable()
      if (reg?.table) tableRef.current = reg.table
      return null
    }
    render(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionPivotTableRenderer props={pivotPayload} />
        </div>
        <RegistrationProbe />
        <Capture />
      </SectionTableProvider>,
    )
    await waitFor(() => expect(tableRef.current).not.toBeNull())
    // The pivot now ships the SAME leading select column as the flat table
    // (mandatory), so the header "Select all" checkbox is present. Nothing is
    // selected yet, so the published selection count is still 0.
    expect(screen.getByTestId("reg")).toHaveTextContent("registered:0")
    expect(screen.getByLabelText("Select all")).toBeInTheDocument()
  })
})
