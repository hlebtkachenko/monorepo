"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  type InspectorMode,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
  useDataTable,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { Search } from "@workspace/ui/lib/icons"

import { actorLabel, toolLabel, TOOL_OPTIONS } from "../held-writes/columns"
import { normalizeSearch } from "../_shared/accounting-format"
import {
  buildInboxColumns,
  InboxDetail,
  statusLabel,
  STATUS_OPTIONS,
  type InboxListRow,
} from "./columns"

/** Free-text search across the visible inbox fields. */
function applySearch(rows: InboxListRow[], query: string): InboxListRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.summary,
      toolLabel(row.tool_name),
      statusLabel(row.status),
      actorLabel(row.actor_kind),
      row.rationale ?? "",
      row.created_at,
    ].some((value) => normalizeSearch(value).includes(q)),
  )
}

/**
 * Ingestion inbox body — a READ-ONLY Table archetype over `fetchIngestionInbox`
 * rows (the org's gated writes from `tool_call_log`, every outcome). The
 * inspector shows the row detail; there are no resolution actions here. The
 * approvals page owns approve/reject.
 */
export function DocumentsInboxBody({ rows }: { rows: InboxListRow[] }) {
  const [search, setSearch] = React.useState("")
  const [inspected, setInspected] = React.useState<InboxListRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode] = React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: InboxListRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])

  const columns = React.useMemo(
    () => buildInboxColumns({ onInspect: openInspector }),
    [openInspector],
  )

  const data = React.useMemo(() => applySearch(rows, search), [rows, search])

  const { table } = useDataTable<InboxListRow>({
    data,
    columns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 140, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0
  const statusColumn = table.getColumn("status")
  const toolColumn = table.getColumn("tool_name")

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <InboxDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) setInspectorOpen(false)
      }}
      inspectorTitle={inspected ? toolLabel(inspected.tool_name) : undefined}
      toolbar={
        <ContentToolbar
          left={
            <>
              {statusColumn ? (
                <DataTableFacetedFilter
                  column={statusColumn}
                  title="Stav"
                  options={STATUS_OPTIONS}
                  multiple
                />
              ) : null}
              {toolColumn ? (
                <DataTableFacetedFilter
                  column={toolColumn}
                  title="Operace"
                  options={TOOL_OPTIONS}
                  multiple
                />
              ) : null}
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder="Hledat v příchozích dokladech…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-7 w-full pl-8"
                />
              </div>
            </>
          }
          right={
            <>
              <DataTableColumnManager table={table} />
              <DataTableMultiSort table={table} />
            </>
          }
        />
      }
      statusBar={
        <ContentStatusBar
          left={
            <div className="flex items-center gap-3">
              <span>
                {visible.length} {visible.length === 1 ? "položka" : "položek"}
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
            </div>
          }
          right={
            <span className="tabular-nums">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {Math.max(table.getPageCount(), 1)}
            </span>
          }
        />
      }
    >
      <DataGridView table={table} className="min-h-0 flex-1" />
    </ContentPanel>
  )
}
