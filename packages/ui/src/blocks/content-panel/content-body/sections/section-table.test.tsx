import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  anchorStructuralPins,
  sectionTable,
  type TableColumnSpec,
} from "./section-table"
import { SectionTableRenderer } from "./section-table-renderer"
import { formatCurrencyCell } from "./section-cell-format"
import {
  SectionTableProvider,
  useSectionInspect,
} from "./section-table-context"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

/** Reflects the bridge's inspector open-state + row id, so a test can prove the
 *  per-row "Open inspector" button drove the opener. */
function InspectProbe() {
  const { inspectOpen, inspectRow } = useSectionInspect()
  const id = (inspectRow as { id?: string } | null)?.id
  return (
    <div data-testid="inspect-probe">
      {inspectOpen ? `open:${id ?? ""}` : "closed"}
    </div>
  )
}

/** Whether a DOM node is an interactive control (encodes axe `nested-interactive`). */
function isInteractive(node: Element): boolean {
  const role = node.getAttribute("role")
  return (
    ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(node.tagName) ||
    role === "button" ||
    role === "checkbox" ||
    role === "link"
  )
}

const COLUMNS: TableColumnSpec[] = [
  { id: "doc", header: "Document", kind: "text", edit: "inline", role: "id" },
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

  it("throws on an empty rowIdKey unconditionally (dev)", () => {
    expect(() =>
      sectionTable({
        rowIdKey: "",
        columns: [{ id: "a", header: "A", kind: "text" }],
        rows: [],
      }),
    ).toThrow(/rowIdKey/)
  })

  it("throws on an empty rowIdKey even when a column id happens to match it (dev)", () => {
    // Regression: the old check only threw when NO column matched the empty
    // rowIdKey, so a column with id "" masked the bug.
    expect(() =>
      sectionTable({
        rowIdKey: "",
        columns: [{ id: "", header: "Blank", kind: "text" }],
        rows: [],
      }),
    ).toThrow(/rowIdKey/)
  })

  it("throws when a data column opts out of filtering (`filter: false`) (dev)", () => {
    // Every non-checkbox column must be filterable — columns are filterable by
    // default, so this only trips on an explicit `filter: false`.
    expect(() =>
      sectionTable({
        rowIdKey: "id",
        columns: [
          { id: "a", header: "A", kind: "text" },
          { id: "b", header: "B", kind: "text", filter: false },
        ],
        rows: [],
      }),
    ).toThrow(/must be filterable/)
  })

  it("throws when a non-`select` column is marked `creatable` (dev)", () => {
    expect(() =>
      sectionTable({
        rowIdKey: "id",
        columns: [{ id: "a", header: "A", kind: "text", creatable: true }],
        rows: [],
      }),
    ).toThrow(/only `kind: "select"` supports a creatable/)
  })

  it("no longer accepts the removed `selection` feature flag (compile-level)", () => {
    const desc = sectionTable({
      rowIdKey: "id",
      columns: COLUMNS,
      rows: ROWS,
      features: {
        // @ts-expect-error `selection` was removed — the leading select column is
        // mandatory (always rendered), so there is no selection flag to toggle.
        selection: "none",
      },
    })
    // The unknown key never reaches the payload either.
    expect(desc.props.features).not.toHaveProperty("selection")
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

  it("repairs a malformed `select` that landed in the right group", () => {
    const next = anchorStructuralPins(
      { left: ["doc"], right: ["select", "amount", "actions"] },
      anchors,
    )
    expect(next.left).toEqual(["select", "doc"])
    expect(next.right).toEqual(["amount", "actions"])
    expect(next.right).not.toContain("select")
  })

  it("repairs a malformed `actions` that landed in the left group", () => {
    const next = anchorStructuralPins(
      { left: ["actions", "select", "doc"], right: ["amount"] },
      anchors,
    )
    expect(next.left).toEqual(["select", "doc"])
    expect(next.right).toEqual(["amount", "actions"])
    expect(next.left).not.toContain("actions")
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

  it("always renders the leading select column, even for a read-only table (selection is mandatory)", () => {
    const readOnly = sectionTable({
      rowIdKey: "id",
      columns: [{ id: "name", header: "Name", kind: "text" }],
      rows: [{ id: "1", name: "Ada" }],
    }).props
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={readOnly} />
      </div>,
    )
    expect(screen.getByLabelText("Select all")).toBeInTheDocument()
    expect(screen.getByLabelText("Select row 1")).toBeInTheDocument()
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

describe("SectionTableRenderer — row inspector affordance", () => {
  const inspectPayload = sectionTable({
    rowIdKey: "id",
    columns: COLUMNS,
    rows: ROWS,
    features: { inspect: true },
  }).props
  const plainPayload = sectionTable({
    rowIdKey: "id",
    columns: COLUMNS,
    rows: ROWS,
  }).props

  it("shows an Open inspector button per row when inspect is on", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={inspectPayload} />
        </div>
      </SectionTableProvider>,
    )
    expect(screen.getAllByLabelText("Open inspector")).toHaveLength(ROWS.length)
  })

  it("has no Open inspector button when inspect is off", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={plainPayload} />
        </div>
      </SectionTableProvider>,
    )
    expect(screen.queryByLabelText("Open inspector")).not.toBeInTheDocument()
  })

  it("opens the inspector for the clicked row (fires the bridge opener)", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={inspectPayload} />
        </div>
        <InspectProbe />
      </SectionTableProvider>,
    )
    expect(screen.getByTestId("inspect-probe")).toHaveTextContent("closed")
    fireEvent.click(screen.getAllByLabelText("Open inspector")[0]!)
    // The opener recorded the FIRST row (id "1") and flipped the Sheet open.
    expect(screen.getByTestId("inspect-probe")).toHaveTextContent("open:1")
  })

  it("keeps Open inspector out of any interactive ancestor (axe nested-interactive)", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={inspectPayload} />
        </div>
      </SectionTableProvider>,
    )
    const button = screen.getAllByLabelText("Open inspector")[0]!
    // Walk up: an interactive control must never have an interactive ancestor.
    let parent = button.parentElement
    while (parent) {
      expect(isInteractive(parent)).toBe(false)
      parent = parent.parentElement
    }
  })

  it("hosts the button in the identity column cell, not a separate actions column", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={inspectPayload} />
        </div>
      </SectionTableProvider>,
    )
    // rowActions is off → no Approve / More-actions column.
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument()
    // The button lives inside a grid cell of the `role: "id"` column ("doc").
    const button = screen.getAllByLabelText("Open inspector")[0]!
    const cell = button.closest('[data-slot="grid-cell"]')
    expect(cell).not.toBeNull()
    expect(cell).toHaveAttribute("data-col", "1") // select is col 0, doc is col 1
  })

  it("renders the Open inspector as a 22px bordered icon box with a proportionate glyph", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={inspectPayload} />
        </div>
      </SectionTableProvider>,
    )
    const button = screen.getAllByLabelText("Open inspector")[0]!
    // A white 22px box with the unselected-checkbox border + token hover fill.
    expect(button.className).toContain("size-[22px]")
    expect(button.className).toContain("border-grid-checkbox-border")
    expect(button.className).toContain("bg-background")
    expect(button.className).toContain("hover:bg-grid-action-hover")
    expect(button.className).toContain("text-grid-action-icon")
    // Glyph sized PROPORTIONATE to the smaller box (size-3.5), not oversized.
    const svg = button.querySelector("svg")
    expect(svg?.getAttribute("class") ?? "").toContain("size-3.5")
  })
})

describe("SectionTableRenderer — creatable select column", () => {
  const creatablePayload = sectionTable({
    rowIdKey: "id",
    columns: [
      { id: "doc", header: "Document", kind: "text", role: "id" },
      {
        id: "party",
        header: "Party",
        kind: "select",
        edit: "inline",
        creatable: true,
        options: [
          { value: "a", label: "ACME" },
          { value: "b", label: "Beta" },
        ],
      },
    ],
    rows: [
      { id: "1", doc: "D1", party: "a" },
      { id: "2", doc: "D2", party: null },
    ],
  }).props

  it("renders a CreatableCombobox input (not a plain Select) for a creatable column", () => {
    wrap(
      <SectionTableProvider>
        <div className="flex h-96 flex-col">
          <SectionTableRenderer props={creatablePayload} />
        </div>
      </SectionTableProvider>,
    )
    // The creatable editor is a text INPUT (type to search / create), whereas the
    // fixed-option SelectEditCell would render a Radix trigger BUTTON.
    const editors = screen.getAllByLabelText("Party")
    expect(editors.length).toBeGreaterThan(0)
    expect(editors[0]!.tagName).toBe("INPUT")
  })
})

describe("SectionTableRenderer — currency + date kinds", () => {
  // cs-CZ number grouping uses a NBSP (U+00A0) that Testing Library's default
  // normalizer preserves, so we locate the leaf cell by a space-agnostic regex
  // and assert its exact textContent equals the formatter output (proving the
  // renderer wired the kind to `formatCurrencyCell`, not printed the raw string).
  const payload = sectionTable({
    rowIdKey: "id",
    columns: [
      { id: "doc", header: "Document", kind: "text", role: "id" },
      // A decimal STRING amount — must display cs-CZ formatted, not verbatim.
      { id: "amount", header: "Amount", kind: "currency" },
      // An ISO date — must display cs-CZ short date, not the raw ISO string.
      { id: "due", header: "Due", kind: "date" },
    ],
    rows: [
      { id: "1", doc: "FP-001", amount: "1234.5000", due: "2026-06-01" },
      { id: "2", doc: "FP-002", amount: "90.00", due: "2026-11-02" },
    ],
  }).props

  it("formats a decimal-string currency cell (cs-CZ), not the raw '1234.5000'", () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    const cell = screen.getByText(/1.234,50/)
    expect(cell.textContent).toBe(formatCurrencyCell("1234.5000"))
    expect(cell.textContent).not.toBe("1234.5000")
    expect(screen.queryByText("1234.5000")).not.toBeInTheDocument()
  })

  it("formats an ISO date cell as a cs-CZ short date, not the raw ISO string", () => {
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={payload} />
      </div>,
    )
    expect(screen.getByText("1. 6. 2026")).toBeInTheDocument()
    expect(screen.queryByText("2026-06-01")).not.toBeInTheDocument()
  })

  it("does NOT render an inline editor for a currency column marked editable", () => {
    // Precision guard: currency must never route through the number editor's
    // Number() coercion, so `edit: "inline"` is ignored for it (read-only).
    const editablePayload = sectionTable({
      rowIdKey: "id",
      columns: [
        { id: "doc", header: "Document", kind: "text", role: "id" },
        { id: "amount", header: "Amount", kind: "currency", edit: "inline" },
      ],
      rows: [{ id: "1", doc: "FP-001", amount: "1234.5000" }],
    }).props
    wrap(
      <div className="flex h-96 flex-col">
        <SectionTableRenderer props={editablePayload} />
      </div>,
    )
    // No <input> seeded with the raw decimal string — it renders as formatted text.
    expect(screen.queryByDisplayValue("1234.5000")).not.toBeInTheDocument()
    const cell = screen.getByText(/1.234,50/)
    expect(cell.textContent).toBe(formatCurrencyCell("1234.5000"))
  })
})
