"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  type InspectorMode,
} from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
  useDataTable,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { Search, Sigma } from "@workspace/ui/lib/icons"

import {
  dateSearchText,
  formatAmount,
  normalizeSearch,
} from "../_shared/accounting-format"
import {
  buildDocumentColumns,
  DocumentDetail,
  DOCUMENT_TYPE_OPTIONS,
  documentTotal,
  documentTypeLabel,
  type DocumentRow,
} from "./columns"

/** Free-text search across every visible column. */
function applySearch(rows: DocumentRow[], query: string): DocumentRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.designation,
      row.counterparty_name ?? "",
      documentTypeLabel(row.type),
      row.base_total,
      row.vat_total,
      String(documentTotal(row)),
      dateSearchText(row.issued_at),
    ].some((value) => normalizeSearch(value).includes(q)),
  )
}

/**
 * Captured-documents table body — the Table archetype over `fetchDocuments`
 * rows: `useDataTable` + `DataGridView` inside a `ContentPanel` with a toolbar
 * (search + optional Typ filter + column/sort managers), a status bar (count +
 * Celkem sum + pagination), and a per-row inspector. Shared by the Records
 * overview (`withType`) and the per-family document pages; the page passes the
 * already-filtered rows down as plain serializable props.
 */
export function DocumentsTable({
  rows,
  counterpartyHeader,
  withType = false,
  searchPlaceholder,
}: {
  rows: DocumentRow[]
  counterpartyHeader: string
  withType?: boolean
  searchPlaceholder: string
}) {
  const [search, setSearch] = React.useState("")
  const [inspected, setInspected] = React.useState<DocumentRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode] = React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: DocumentRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])

  const columns = React.useMemo(
    () =>
      buildDocumentColumns({
        counterpartyHeader,
        withType,
        onInspect: openInspector,
      }),
    [counterpartyHeader, withType, openInspector],
  )

  const data = React.useMemo(() => applySearch(rows, search), [rows, search])

  const { table } = useDataTable<DocumentRow>({
    data,
    columns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 140, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const totalSum = visible.reduce(
    (sum, r) => sum + documentTotal(r.original),
    0,
  )
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0
  const typeColumn = withType ? table.getColumn("type") : undefined

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={
        inspected ? (
          <DocumentDetail
            row={inspected}
            counterpartyLabel={counterpartyHeader}
          />
        ) : null
      }
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) setInspectorOpen(false)
      }}
      inspectorTitle={inspected?.designation}
      toolbar={
        <ContentToolbar
          left={
            <>
              {typeColumn ? (
                <DataTableFacetedFilter
                  column={typeColumn}
                  title="Typ"
                  options={DOCUMENT_TYPE_OPTIONS}
                  multiple
                />
              ) : null}
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
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
                {visible.length}{" "}
                {visible.length === 1 ? "document" : "documents"}
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Sigma className="size-3.5" aria-hidden />
                <span className="tabular-nums">{formatAmount(totalSum)}</span>
              </span>
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
