import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AppShell } from "@workspace/ui/blocks/app-shell"
import { sectionTable } from "@workspace/ui/blocks/content-panel"
import type {
  TableColumnSpec,
  TableSectionRow,
} from "@workspace/ui/blocks/content-panel"
import { IconProvider } from "@workspace/ui/icon-packs"

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
      <AppShell>
        <ArchetypeTable<TableSectionRow>
          title="Invoices"
          toolbar={() => ({})}
          inspectorRowTitle={(row) => `Inspector for ${String(row.document)}`}
          inspectorRowContent={(row) => ({
            details: <div>Row detail {String(row.id)}</div>,
          })}
          sections={[
            sectionTable({
              rowIdKey: "id",
              columns: [
                {
                  id: "document",
                  header: "Document",
                  kind: "text",
                  role: "id",
                },
              ],
              rows: ROWS,
              features: { inspect },
            }),
          ]}
        />
      </AppShell>,
      { wrapper: IconProvider },
    )
  }

  it("opens the inspector rail for the clicked row (end-to-end)", async () => {
    renderArchetype(true)
    // The rail content is not mounted until the per-row opener fires.
    expect(screen.queryByText("Inspector for FP-001")).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText("Open inspector")[0]!)
    // The title shows twice (breadcrumb crumb + fallback name) — both are the rail.
    expect(
      (await screen.findAllByText("Inspector for FP-001")).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/Row detail 1/)).toBeInTheDocument()
  })

  it("has no Open inspector button when inspect is off", () => {
    renderArchetype(false)
    expect(screen.queryByLabelText("Open inspector")).not.toBeInTheDocument()
  })
})

type Row = TableSectionRow & { document: string; partner: string }

const NAV_COLUMNS: TableColumnSpec[] = [
  { id: "document", header: "Document", kind: "text", role: "id" },
  { id: "partner", header: "Partner", kind: "text" },
]

const NAV_ROWS: Row[] = [
  { id: "1", document: "FP-001", partner: "Acme" },
  { id: "2", document: "FP-002", partner: "Beta" },
  { id: "3", document: "FP-003", partner: "Gamma" },
]

function NavTestPage() {
  return (
    <ArchetypeTable<Row>
      title="Invoices"
      toolbar={() => ({})}
      inspectorRowTitle={(row) => `#${row.document}`}
      inspectorRowName={(row) => row.partner}
      sections={[
        sectionTable({
          rowIdKey: "id",
          columns: NAV_COLUMNS,
          rows: NAV_ROWS,
          features: { inspect: true },
        }),
      ]}
    />
  )
}

/**
 * Regression coverage for adjacent-item navigation in the inspector rail: it
 * must walk the table's actual current row order (as rendered), not a
 * separately-tracked index.
 */
describe("ArchetypeTable adjacent navigation", () => {
  it("Next/Prev walk the real rendered row order", async () => {
    render(
      <AppShell>
        <NavTestPage />
      </AppShell>,
      { wrapper: IconProvider },
    )

    const openButtons = await screen.findAllByLabelText("Open inspector")
    // Open the first row's inspector.
    fireEvent.click(openButtons[0]!)
    const inspector = await waitFor(() => {
      const el = document.querySelector('[data-slot="app-shell-inspector"]')
      if (!el) throw new Error("inspector not open")
      return el as HTMLElement
    })
    const scoped = within(inspector)
    expect(await scoped.findByText("Acme")).toBeInTheDocument()
    expect(scoped.getByRole("button", { name: "Previous item" })).toBeDisabled()

    fireEvent.click(scoped.getByRole("button", { name: "Next item" }))
    expect(await scoped.findByText("Beta")).toBeInTheDocument()
    expect(scoped.queryByText("Acme")).not.toBeInTheDocument()

    fireEvent.click(scoped.getByRole("button", { name: "Next item" }))
    expect(await scoped.findByText("Gamma")).toBeInTheDocument()
    expect(scoped.getByRole("button", { name: "Next item" })).toBeDisabled()

    fireEvent.click(scoped.getByRole("button", { name: "Previous item" }))
    expect(await scoped.findByText("Beta")).toBeInTheDocument()
  })
})
