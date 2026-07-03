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

import { normalizeSearch } from "../_shared/accounting-format"
import {
  actorLabel,
  buildHeldWriteColumns,
  HeldWriteDetail,
  TOOL_OPTIONS,
  toolLabel,
  type HeldWriteListRow,
} from "./columns"

/** Free-text search across the visible held-write fields. */
function applySearch(
  rows: HeldWriteListRow[],
  query: string,
): HeldWriteListRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.summary,
      toolLabel(row.tool_name),
      actorLabel(row.actor_kind),
      row.idempotency_key,
      row.rationale ?? "",
      row.created_at,
    ].some((value) => normalizeSearch(value).includes(q)),
  )
}

/**
 * Held-writes review queue body — the Table archetype over `fetchHeldWrites`
 * rows. The inspector shows the full gated payload and resolves the write via
 * the `resolveHeldWrite` server action (approve replays the domain call,
 * reject just marks the row); the resolved row disappears on revalidate.
 */
export function HeldWritesBody({
  rows,
  orgSlug,
}: {
  rows: HeldWriteListRow[]
  orgSlug: string
}) {
  const [search, setSearch] = React.useState("")
  const [inspected, setInspected] = React.useState<HeldWriteListRow | null>(
    null,
  )
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode] = React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: HeldWriteListRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])

  const columns = React.useMemo(
    () => buildHeldWriteColumns({ onInspect: openInspector }),
    [openInspector],
  )

  const data = React.useMemo(() => applySearch(rows, search), [rows, search])

  const { table } = useDataTable<HeldWriteListRow>({
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
  const toolColumn = table.getColumn("tool_name")

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={
        inspected ? (
          <HeldWriteDetail
            row={inspected}
            orgSlug={orgSlug}
            onResolved={() => {
              setInspectorOpen(false)
              setInspected(null)
            }}
          />
        ) : null
      }
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
                  placeholder="Hledat v položkách ke schválení…"
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
                {visible.length} {visible.length === 1 ? "položka" : "položek"}{" "}
                ke schválení
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
