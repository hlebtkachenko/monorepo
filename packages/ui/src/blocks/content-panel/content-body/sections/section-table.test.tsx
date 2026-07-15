import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  anchorStructuralPins,
  sectionTable,
  type TableColumnSpec,
} from "./section-table"
import { SectionTableRenderer } from "./section-table-renderer"
import { SectionTableProvider } from "./section-table-context"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const COLUMNS: TableColumnSpec[] = [
  { id: "doc", header: "Document", kind: "text", edit: "inline" },
  {
    id: "status",
    header: "Status",
    kind: "select",
    edit: "inline",
    options: [
      { value: "new", label: "New" },
      { value: "posted", label: "Posted" },
    ],
  },
  { id: "amount", header: "Amount", kind: "number" },
]

const ROWS = [
  { id: "1", doc: "FP-001", status: "new", amount: 100 },
  { id: "2", doc: "FP-002", status: "posted", amount: 200 },
]

describe("sectionTable (factory)", () => {
  it("mints a branded 'table' descriptor that fills the body", () => {
    const desc = sectionTable({
      anchor: "invoices",
      rowIdKey: "id",
      columns: COLUMNS,
      rows: ROWS,
    })
    expect(isSectionDescriptor(desc)).toBe(true)
    expect(desc.kind).toBe("table")
    expect(desc.anchor).toBe("invoices")
    expect(desc.fill).toBe(true)
  })

  it("defaults features + names the harvest prefix from the anchor", () => {
    const desc = sectionTable({
      anchor: "invoices",
      rowIdKey: "id",
      columns: COLUMNS,
      rows: ROWS,
    })
    expect(desc.props.features).toEqual({
      selection: "multi",
      search: true,
      inspect: false,
      rowActions: false,
    })
    expect(desc.props.name).toBe("invoices")
  })

  it("throws on a duplicate column id (dev)", () => {
    expect(() =>
      sectionTable({
        rowIdKey: "id",
        columns: [
          { id: "a", header: "A", kind: "text" },
          { id: "a", header: "A2", kind: "text" },
        ],
        rows: [],
      }),
    ).toThrow(/duplicate column id/)
  })
})

describe("anchorStructuralPins (pin invariant)", () => {
  const anchors = { hasSelect: true, hasActions: true }

  it("keeps a newly pinned-right column BEFORE actions (bug #1)", () => {
    // TanStack appends a header-menu pin to the end of the group.
    const next = anchorStructuralPins(
      { left: ["select"], right: ["actions", "partner"] },
      anchors,
    )
    expect(next.right).toEqual(["partner", "actions"])
  })

  it("keeps select first-left after a pin lands ahead of it", () => {
    const next = anchorStructuralPins(
      { left: ["doc", "select"], right: ["actions"] },
      anchors,
    )
    expect(next.left).toEqual(["select", "doc"])
  })

  it("repairs a within-group drag that dislodges actions", () => {
    // A drag reorders columnPinning.right to put a data column last.
    const dragged = anchorStructuralPins(
      { left: ["select"], right: ["amount", "actions", "vat"] },
      anchors,
    )
    expect(dragged.right).toEqual(["amount", "vat", "actions"])
  })

  it("leaves ordering of non-structural pins otherwise intact", () => {
    const next = anchorStructuralPins(
      { left: ["select", "a", "b"], right: ["x", "y", "actions"] },
      anchors,
    )
    expect(next.left).toEqual(["select", "a", "b"])
    expect(next.right).toEqual(["x", "y", "actions"])
  })

  it("no-ops the anchors that a table does not have", () => {
    const next = anchorStructuralPins(
      { left: ["a"], right: ["x"] },
      { hasSelect: false, hasActions: false },
    )
    expect(next).toEqual({ left: ["a"], right: ["x"] })
  })
})

describe("SectionTableRenderer", () => {
  const payload = sectionTable({
    rowIdKey: "id",
    columns: COLUMNS,
    rows: ROWS,
  }).props

  it("renders the grid: headers, rows, a leading select column", () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    expect(screen.getByText("Document")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByLabelText("Select all")).toBeInTheDocument()
  })

  it("renders inline editors for editable cells", () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    // Editable text cells become <Input>s seeded from the row value.
    expect(screen.getByDisplayValue("FP-001")).toBeInTheDocument()
    expect(screen.getByDisplayValue("FP-002")).toBeInTheDocument()
  })

  it("commits an inline edit into the draft", () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    const input = screen.getByDisplayValue("FP-001")
    fireEvent.change(input, { target: { value: "FP-999" } })
    fireEvent.blur(input)
    expect(screen.getByDisplayValue("FP-999")).toBeInTheDocument()
  })

  it("adds Filter + AI analyze to the header menu inside a provider", async () => {
    // Inside SectionTableProvider the bridge supplies onColumnFilter/onColumnAnalyze,
    // so the header dropdown gains the two enrichment items (bug #5). Outside a
    // provider they are absent (the callbacks are null) — see the next test.
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={payload} />
        </div>
      </SectionTableProvider>,
    )
    // Radix opens the dropdown on pointerdown (mouse button 0), not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Document" }), {
      button: 0,
      ctrlKey: false,
    })
    expect(await screen.findByText("Filter")).toBeInTheDocument()
    expect(screen.getByText("AI analyze")).toBeInTheDocument()
  })

  it("omits Filter + AI analyze when rendered without a provider", async () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    // Radix opens the dropdown on pointerdown (mouse button 0), not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Document" }), {
      button: 0,
      ctrlKey: false,
    })
    // The sort item confirms the menu opened; the enrichment items are absent.
    expect(await screen.findByText("Sort ascending")).toBeInTheDocument()
    expect(screen.queryByText("Filter")).not.toBeInTheDocument()
    expect(screen.queryByText("AI analyze")).not.toBeInTheDocument()
  })
})
