import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"
import { sectionTable } from "@workspace/ui/blocks/content-panel"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { ArchetypeTable } from "./archetype-table"
import { resolveHeaderFilterTarget } from "./archetype-table"

describe("resolveHeaderFilterTarget", () => {
  const filterCols = ["document", "partner", "amount"]

  it("preselects a column the multi-filter owns", () => {
    expect(resolveHeaderFilterTarget("partner", filterCols, "status")).toEqual({
      property: "partner",
      routeToStatus: false,
    })
  })

  it("routes the statusFilter-delegated column to the faceted control", () => {
    // Regression: passing "status" (not in the multi-filter) as `property` threw
    // in FilterSelector.getColumn — it must route to the status filter instead.
    expect(resolveHeaderFilterTarget("status", filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: true,
    })
  })

  it("never yields an unknown property for a column in neither control", () => {
    expect(resolveHeaderFilterTarget("mystery", filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })

  it("is inert with no request", () => {
    expect(resolveHeaderFilterTarget(undefined, filterCols, "status")).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })

  it("does not route to status when no statusFilter columnId is set", () => {
    expect(resolveHeaderFilterTarget("status", filterCols, undefined)).toEqual({
      property: undefined,
      routeToStatus: false,
    })
  })
})

describe("ArchetypeTable — row inspector", () => {
  const ROWS: TableSectionRow[] = [
    { id: "1", document: "FP-001" },
    { id: "2", document: "FP-002" },
  ]

  function renderArchetype(inspect: boolean) {
    return render(
      <ArchetypeTable<TableSectionRow>
        title="Invoices"
        toolbar={() => ({})}
        renderInspector={(row) => ({
          title: `Inspector for ${String(row.document)}`,
          body: <div>Row detail {String(row.id)}</div>,
        })}
        sections={[
          sectionTable({
            rowIdKey: "id",
            columns: [
              { id: "document", header: "Document", kind: "text", role: "id" },
            ],
            rows: ROWS,
            features: { inspect },
          }),
        ]}
      />,
      { wrapper: IconProvider },
    )
  }

  it("opens the renderInspector Sheet for the clicked row (end-to-end)", () => {
    renderArchetype(true)
    // The Sheet content is not mounted until the per-row opener fires.
    expect(screen.queryByText("Inspector for FP-001")).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText("Open inspector")[0]!)
    expect(screen.getByText("Inspector for FP-001")).toBeInTheDocument()
    expect(screen.getByText(/Row detail 1/)).toBeInTheDocument()
  })

  it("has no Open inspector button when inspect is off", () => {
    renderArchetype(false)
    expect(screen.queryByLabelText("Open inspector")).not.toBeInTheDocument()
  })
})
