"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  DetailField,
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
  formatDate,
  formatDecimal,
  normalizeSearch,
} from "../_shared/accounting-format"
import { DIRECTION_LABEL, saldokontoColumns } from "./columns"
import { useSaldokonto } from "./context"
import { OPEN_ITEM_TABS, type OpenItemRow, type SaldoPartnerRow } from "./data"

function applySearch(rows: OpenItemRow[], query: string): OpenItemRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [row.variableSymbol ?? "", row.accountNumber, row.direction].some((value) =>
      normalizeSearch(String(value)).includes(q),
    ),
  )
}

function OpenItemDetail({ row }: { row: OpenItemRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Doklad" value={row.variableSymbol ?? "—"} />
      <DetailField label="Account" value={row.accountNumber} />
      <DetailField
        label="Direction"
        value={
          <Badge
            variant={row.direction === "RECEIVABLE" ? "default" : "secondary"}
          >
            {DIRECTION_LABEL[row.direction] ?? row.direction}
          </Badge>
        }
      />
      <DetailField
        label="Original"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.originalAmount)}
          </span>
        }
      />
      <DetailField
        label="Settled"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.settledAmount)}
          </span>
        }
      />
      <DetailField
        label="Remaining"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.remainingAmount)}
          </span>
        }
      />
      <DetailField label="Currency" value={row.currencyCode} />
      <DetailField
        label="Settled?"
        value={
          <Badge variant={row.isSettled ? "default" : "outline"}>
            {row.isSettled ? "Yes" : "No"}
          </Badge>
        }
      />
      <DetailField
        label="Issue date"
        value={
          <span className="tabular-nums">{formatDate(row.issueDate)}</span>
        }
      />
      <DetailField
        label="Due date"
        value={
          <span className="tabular-nums">
            {row.dueDate ? formatDate(row.dueDate) : "—"}
          </span>
        }
      />
    </dl>
  )
}

/**
 * Saldokonto (open items) body — per-item original | settled | remaining split
 * by direction (pohledávky / závazky). Table archetype: `useDataTable` +
 * `DataGridView` in a `ContentPanel` with search + Direction filter, a status
 * bar summing remaining, and a per-item inspector. Rows come from the server
 * page via props.
 */
export function SaldokontoBody({
  rows,
  partners,
}: {
  rows: OpenItemRow[]
  partners: SaldoPartnerRow[]
}) {
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useSaldokonto()
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = OPEN_ITEM_TABS.find((t) => t.value === activeTab)
    if (!tab?.direction) return rows
    return rows.filter((row) => row.direction === tab.direction)
  }, [rows, activeTab])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<OpenItemRow>({
    data,
    columns: saldokontoColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 130, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const remainingTotal = visible.reduce(
    (sum, r) => sum + Number(r.original.remainingAmount),
    0,
  )
  const partnerCount = new Set(partners.map((p) => p.counterpartyId)).size
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0
  const directionColumn = table.getColumn("direction")

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <OpenItemDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.variableSymbol ?? inspected?.accountNumber}
      toolbar={
        <ContentToolbar
          left={
            <>
              {directionColumn ? (
                <DataTableFacetedFilter
                  column={directionColumn}
                  title="Direction"
                  options={Object.entries(DIRECTION_LABEL).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  multiple
                />
              ) : null}
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder="Search open items…"
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
                {visible.length} {visible.length === 1 ? "item" : "items"}
              </span>
              <span>
                {partnerCount} {partnerCount === 1 ? "partner" : "partners"}
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Sigma className="size-3.5" aria-hidden />
                <span className="tabular-nums">
                  Remaining {formatDecimal(String(remainingTotal))}
                </span>
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
