"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  sectionPivotTable,
  useTableFilters,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"
import type { FiltersState } from "@workspace/ui/components/filter-bar"

import { orgHref } from "@/lib/org/href"

/**
 * DebugPivotTableView — the Debug → Archetype Table (Pivot Table) reference page.
 * The Table archetype hosts the Pivot Table Body (`sectionPivotTable`) with the
 * same mandatory chrome as the Normal Table: views, favorite, selection footer,
 * and a per-column filter. A Pivot body has no flat `table` section, so the
 * archetype does NOT auto-generate the filter — this page owns it, over the
 * SOURCE fields, pre-filtering the long-format rows BEFORE they are pivoted.
 *
 * Rows come from `demo_debug_pivot_table_record` (dev-seeded), projected
 * server-side. The section folds them category × month → Σ amount.
 */

const STATUS_OPTIONS: TableColumnOption[] = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" },
]

const CATEGORY_OPTIONS: TableColumnOption[] = [
  { value: "Services", label: "Services" },
  { value: "Goods", label: "Goods" },
  { value: "Travel", label: "Travel" },
  { value: "Software", label: "Software" },
]

// The SOURCE fields the toolbar filter narrows (pre-pivot). Not a rendered Table
// — only the filter specs the multi-filter derives from (category/status as
// option dropdowns, month as text, amount as a number range).
const SOURCE_COLUMNS: TableColumnSpec[] = [
  {
    id: "category",
    header: "Category",
    kind: "badge",
    options: CATEGORY_OPTIONS,
  },
  { id: "month", header: "Month", kind: "text" },
  { id: "status", header: "Status", kind: "badge", options: STATUS_OPTIONS },
  { id: "amount", header: "Amount", kind: "number", align: "end" },
]

// The selection footer is built by the SAME design-system helper the Normal
// Table uses (`buildTableFooter`), so the Pivot can never ship without the Export
// affordance — Export = a segmented ButtonGroup "Copy to clipboard" | "Export as
// CSV" over the selected pivot groups × visible columns.
function selectionActions(
  table: Table<TableSectionRow> | null,
): ContentFooterAction[] {
  return buildTableFooter(table, { exportFileName: "pivot" })
}

export function DebugPivotTableView({
  slug,
  title,
  rows,
  favorite,
}: {
  slug: string
  title: string
  rows: readonly TableSectionRow[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])

  // View narrows the source rows by status (page-owned, coarse); the multi-filter
  // narrows further (per source field). Both run BEFORE the pivot fold.
  const viewRows = React.useMemo(
    () =>
      activeTab === "all"
        ? rows
        : rows.filter((row) => String(row.status ?? "") === activeTab),
    [rows, activeTab],
  )

  const { filter, rows: sourceRows } = useTableFilters({
    columns: SOURCE_COLUMNS,
    rows: viewRows,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = React.useMemo(
    () => [
      { value: "all", label: "All", count: rows.length },
      ...STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: rows.filter((row) => String(row.status ?? "") === option.value)
          .length,
      })),
    ],
    [rows],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      // A Table archetype toolbar ALWAYS has search — the pivot's global filter
      // runs over the row labels. buildTableToolbar also adds the columns manager
      // + sort; the source-field filter is threaded in.
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
        filter,
      }),
    [search, filter],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title={title}
      breadcrumb={[
        { label: "Debug", href: orgHref(slug, "debug"), icon: "Bug" },
      ]}
      favorite={favorite}
      views={{
        tabs: views,
        value: activeTab,
        onValueChange: setActiveTab,
        onAddView: () => toast.success("Add view — coming soon"),
      }}
      toolbar={buildToolbar}
      selectionActions={selectionActions}
      sections={[
        sectionPivotTable({
          anchor: "pivot",
          rows: sourceRows,
          // A real nested pivot: TWO row-dimension levels (Category → Status)
          // form an expand/collapse tree, and each Month column bands into two
          // measures (Total + Count) — not a single flat group.
          rowDimensions: [
            { field: "category", label: "Category" },
            { field: "status", label: "Status" },
          ],
          columnDimensions: [{ field: "month", label: "Month" }],
          measures: [
            {
              id: "total",
              label: "Total",
              agg: "sum",
              field: "amount",
              format: { style: "currency", currency: "CZK" },
            },
            { id: "count", label: "Count", agg: "count" },
          ],
          rowLabelHeader: "Category / Status",
          subtotalRows: true,
          emptyText: "No demo records — seed the dev org first.",
        }),
      ]}
    />
  )
}
