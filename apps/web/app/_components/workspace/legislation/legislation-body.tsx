"use client"

import * as React from "react"

import { ContentPanel, DetailField } from "@workspace/ui/blocks/app-content"
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { useDataTable } from "@workspace/ui/components/data-table"
import { toast } from "@workspace/ui/components/sonner"
import { useIcons } from "@workspace/ui/icon-packs"

import { TableStatusBar } from "../_shared/table-status-bar"
import { obligationColumns } from "./columns"
import { useLegislation } from "./context"
import { LegislationToolbar } from "./legislation-toolbar"
import {
  OBLIGATION_ROWS,
  OBLIGATION_TABS,
  formatDueDate,
  type ObligationRow,
} from "./data"

/** Free-text search across the obligation's readable fields. */
function applySearch(rows: ObligationRow[], query: string): ObligationRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    [row.obligation, row.company, row.status, row.assignee].some((value) =>
      value.toLowerCase().includes(q),
    ),
  )
}

/** Inspector content — the detail of the selected obligation. */
function ObligationDetail({ row }: { row: ObligationRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Obligation" value={row.obligation} />
      <DetailField label="Company" value={row.company} />
      <DetailField label="Due date" value={formatDueDate(row.dueDate)} />
      <DetailField
        label="Status"
        value={<Badge variant="secondary">{row.status}</Badge>}
      />
      <DetailField label="Assigned" value={row.assignee} />
    </dl>
  )
}

/**
 * Legislation body — the Table archetype on the workspace shell. A static MOCK
 * obligation board drives a TanStack `DataGridView`: tab-filtered by status, a
 * universal search, the faceted Status filter, row selection with a bulk
 * `ActionBar`, and a per-row `Inspector`. Mounts as the shell `children`.
 */
export function LegislationBody({
  rows = OBLIGATION_ROWS,
}: {
  rows?: ObligationRow[]
}) {
  const icons = useIcons()
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useLegislation()

  const [statusFilterOpen, setStatusFilterOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = OBLIGATION_TABS.find((t) => t.value === activeTab)
    if (!tab?.status) return rows
    return rows.filter((row) => row.status === tab.status)
  }, [activeTab, rows])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<ObligationRow>({
    data,
    columns: obligationColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 480 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 15 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0

  const CheckIcon = icons.Check
  const AssignIcon = icons.UserPlus

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <ObligationDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.obligation}
      toolbar={
        <LegislationToolbar
          table={table}
          statusOpen={statusFilterOpen}
          onStatusOpenChange={setStatusFilterOpen}
          search={search}
          onSearchChange={setSearch}
        />
      }
      statusBar={
        <TableStatusBar
          table={table}
          noun="obligation"
          isFiltered={isFiltered}
        />
      }
      actionBar={
        <ActionBar
          open={selectedCount > 0}
          onOpenChange={(open) => {
            if (!open) table.resetRowSelection()
          }}
          aria-label="Bulk actions"
          sideOffset="var(--app-statusbar-clearance, 16px)"
        >
          <ActionBarSelection>{selectedCount} selected</ActionBarSelection>
          <ActionBarSeparator />
          <ActionBarGroup>
            <ActionBarItem
              onSelect={() => {
                toast("Mark filed — coming soon")
                table.resetRowSelection()
              }}
            >
              <CheckIcon />
              Mark filed
            </ActionBarItem>
            <ActionBarItem
              onSelect={() => {
                toast("Assign — coming soon")
                table.resetRowSelection()
              }}
            >
              <AssignIcon />
              Assign
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      }
    >
      <DataGridView table={table} className="min-h-0 flex-1" />
    </ContentPanel>
  )
}
