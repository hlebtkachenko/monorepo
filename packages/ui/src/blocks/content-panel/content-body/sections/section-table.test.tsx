import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionTable, type TableColumnSpec } from "./section-table"
import { SectionTableRenderer } from "./section-table-renderer"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const COLUMNS: TableColumnSpec[] = [
  { id: "doc", header: "Document", kind: "text", editable: true },
  {
    id: "status",
    header: "Status",
    kind: "select",
    editable: true,
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
})
