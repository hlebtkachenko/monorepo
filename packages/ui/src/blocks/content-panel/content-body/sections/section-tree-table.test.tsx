import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionTreeTable, type TreeTableRow } from "./section-tree-table"
import { SectionTreeTableRenderer } from "./section-tree-table-renderer"
import { SectionTableProvider } from "./section-table-context"
import { isSectionDescriptor } from "./section"
import type { TableColumnSpec } from "./section-table"

const COLUMNS: TableColumnSpec[] = [
  { id: "number", header: "Number", kind: "text", role: "id" },
  { id: "name", header: "Name", kind: "text", edit: "inline" },
]

const TREE: TreeTableRow[] = [
  {
    id: "tier:0",
    values: { number: "0", name: "Long-term assets" },
    selectable: false,
    editable: false,
    subRows: [
      {
        id: "021",
        values: { number: "021", name: "Buildings" },
        subRows: [
          { id: "021.001", values: { number: "021.001", name: "Office" } },
        ],
      },
    ],
  },
]

function renderTree(
  props: Parameters<typeof SectionTreeTableRenderer>[0]["props"],
  onCellEdit?: (e: {
    rowId: string
    columnId: string
    value: string | number | null
  }) => void,
) {
  return render(
    <IconProvider>
      <SectionTableProvider onCellCommit={onCellEdit}>
        <div className="flex h-[480px] flex-col">
          <SectionTreeTableRenderer props={props} />
        </div>
      </SectionTableProvider>
    </IconProvider>,
  )
}

describe("sectionTreeTable (factory)", () => {
  it("mints a branded 'tree-table' descriptor that fills the body", () => {
    const desc = sectionTreeTable({
      anchor: "chart",
      columns: COLUMNS,
      rows: TREE,
    })
    expect(isSectionDescriptor(desc)).toBe(true)
    expect(desc.kind).toBe("tree-table")
    expect(desc.fill).toBe(true)
    expect(desc.props.features).toEqual({
      search: true,
      inspect: false,
      rowActions: false,
    })
    // defaultExpanded defaults to `true`; name defaults to the anchor.
    expect(desc.props.defaultExpanded).toBe(true)
    expect(desc.props.name).toBe("chart")
  })

  it("rejects a duplicate column id and more than one identity column", () => {
    expect(() =>
      sectionTreeTable({
        columns: [COLUMNS[0]!, COLUMNS[0]!],
        rows: TREE,
      }),
    ).toThrow(/duplicate column id/)
    expect(() =>
      sectionTreeTable({
        columns: [
          { id: "a", header: "A", kind: "text", role: "id" },
          { id: "b", header: "B", kind: "text", role: "id" },
        ],
        rows: TREE,
      }),
    ).toThrow(/at most one column may have/)
  })
})

describe("SectionTreeTableRenderer", () => {
  it("expands to the given depth and toggles children", () => {
    const desc = sectionTreeTable({
      columns: COLUMNS,
      rows: TREE,
      defaultExpanded: 1,
    })
    renderTree(desc.props)

    // Depth 1 expands the tier (its synthetic child shows); the analytical (depth 2)
    // stays collapsed until its parent is expanded. Assert on the non-editable
    // identity (number) column — the editable name column renders an <input>, whose
    // value is not matchable by getByText.
    expect(screen.getByText("Long-term assets")).toBeInTheDocument()
    expect(screen.getByText("021")).toBeInTheDocument()
    expect(screen.queryByText("021.001")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Expand 021/i }))
    expect(screen.getByText("021.001")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Collapse 021/i }))
    expect(screen.queryByText("021.001")).not.toBeInTheDocument()
  })

  it("does not offer a select checkbox for a structural tier node", () => {
    const desc = sectionTreeTable({ columns: COLUMNS, rows: TREE })
    renderTree(desc.props)
    // Real account rows get a "Select row N" checkbox; the tier node does not, so
    // there is exactly one fewer checkbox than the rendered non-tier rows.
    expect(
      screen.queryByRole("checkbox", { name: /Select row 1/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", { name: /Select row 2/i }),
    ).toBeInTheDocument()
  })

  it("commits an inline edit on a real child row through the bridge", () => {
    const onCellEdit = vi.fn()
    const desc = sectionTreeTable({
      columns: COLUMNS,
      rows: TREE,
      defaultExpanded: true,
    })
    renderTree(desc.props, onCellEdit)

    const input = screen.getByDisplayValue("Buildings")
    fireEvent.change(input, { target: { value: "Buildings & land" } })
    fireEvent.blur(input)
    expect(onCellEdit).toHaveBeenCalledWith({
      rowId: "021",
      columnId: "name",
      value: "Buildings & land",
    })
  })
})
