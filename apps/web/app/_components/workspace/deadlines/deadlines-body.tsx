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
import { Separator } from "@workspace/ui/components/separator"
import { toast } from "@workspace/ui/components/sonner"
import { useIcons } from "@workspace/ui/icon-packs"

import { deadlineColumns } from "./columns"
import { useDeadlines } from "./context"
import { DeadlinesToolbar } from "./deadlines-toolbar"
import {
  DEADLINE_ROWS,
  DEADLINE_TABS,
  formatDueDate,
  type DeadlineRow,
} from "./data"

/** Free-text search across the deadline's readable fields. */
function applySearch(rows: DeadlineRow[], query: string): DeadlineRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    [row.obligation, row.client, row.status, row.assignee].some((value) =>
      value.toLowerCase().includes(q),
    ),
  )
}

/** Inspector content — the detail of the selected deadline. */
function DeadlineDetail({ row }: { row: DeadlineRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Obligation" value={row.obligation} />
      <DetailField label="Client" value={row.client} />
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
 * Deadlines body — the Table archetype on the workspace shell. A static MOCK
 * obligation board drives a TanStack `DataGridView`: tab-filtered by status, a
 * universal search, the faceted Status filter, row selection with a bulk
 * `ActionBar`, and a per-row `Inspector`. Mounts as the shell `children`.
 */
export function DeadlinesBody({
  rows = DEADLINE_ROWS,
}: {
  rows?: DeadlineRow[]
}) {
  const icons = useIcons()
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useDeadlines()

  const [statusFilterOpen, setStatusFilterOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = DEADLINE_TABS.find((t) => t.value === activeTab)
    if (!tab?.status) return rows
    return rows.filter((row) => row.status === tab.status)
  }, [activeTab, rows])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<DeadlineRow>({
    data,
    columns: deadlineColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 480 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 15 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const filteredRows = table.getFilteredRowModel().rows
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0

  const CheckIcon = icons.Check
  const AssignIcon = icons.UserPlus

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <DeadlineDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.obligation}
      toolbar={
        <DeadlinesToolbar
          table={table}
          statusOpen={statusFilterOpen}
          onStatusOpenChange={setStatusFilterOpen}
          search={search}
          onSearchChange={setSearch}
        />
      }
      statusBar={
        <div className="flex h-9 shrink-0 items-center gap-4 border-t border-border-subtle px-2 text-xs text-muted-foreground">
          <span>
            {filteredRows.length}{" "}
            {filteredRows.length === 1 ? "deadline" : "deadlines"}
          </span>
          {isFiltered ? (
            <>
              <Separator
                orientation="vertical"
                inset
                className="!h-6 bg-border-subtle"
              />
              <Badge variant="secondary" className="h-5">
                Filtered
              </Badge>
            </>
          ) : null}
        </div>
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
