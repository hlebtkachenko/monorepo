"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbarLegacy,
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
  formatDecimal,
  formatDate,
  normalizeSearch,
} from "../_shared/accounting-format"
import { journalColumns } from "./columns"
import { useDenik } from "./context"
import { JOURNAL_TABS, type JournalRow } from "./data"

/** Free-text search across every visible column. */
function applySearch(rows: JournalRow[], query: string): JournalRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.summaryDesignation,
      row.eventDescription,
      row.counterpartyName,
      row.accountNumber,
      row.accountName,
      row.side,
      row.amount,
      row.postingDate,
    ].some(
      (value) => value != null && normalizeSearch(String(value)).includes(q),
    ),
  )
}

function JournalDetail({ row }: { row: JournalRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Doklad" value={row.summaryDesignation} />
      {row.eventDescription ? (
        <DetailField label="Popis" value={row.eventDescription} />
      ) : null}
      {row.counterpartyName ? (
        <DetailField label="Protistrana" value={row.counterpartyName} />
      ) : null}
      <DetailField label="Date" value={formatDate(row.postingDate)} />
      <DetailField
        label="Account"
        value={
          row.accountName
            ? `${row.accountNumber} — ${row.accountName}`
            : row.accountNumber
        }
      />
      <DetailField
        label="Side"
        value={
          <Badge variant={row.side === "DEBIT" ? "default" : "secondary"}>
            {row.side === "DEBIT" ? "MD" : "Dal"}
          </Badge>
        }
      />
      <DetailField
        label="Amount"
        value={
          <span className="tabular-nums">{formatDecimal(row.amount)}</span>
        }
      />
      <DetailField label="Type" value={row.summaryType} />
    </dl>
  )
}

/**
 * Deník (journal) body — the double-entry lines of the period in book order.
 * Mounts the Table archetype: `useDataTable` + `DataGridView` inside a
 * `ContentPanel` with a toolbar (search + side filter + column/sort managers),
 * a status bar (count + running debit sum + pagination), and a per-row
 * inspector. Rows come from the server page (route `page.tsx`).
 */
export function DenikBody({ rows }: { rows: JournalRow[] }) {
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useDenik()
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = JOURNAL_TABS.find((t) => t.value === activeTab)
    if (!tab?.kind) return rows
    return rows.filter((row) => row.side === tab.kind)
  }, [rows, activeTab])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<JournalRow>({
    data,
    columns: journalColumns,
    getRowId: (row) => row.lineId,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 140, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const debitTotal = visible
    .filter((r) => r.original.side === "DEBIT")
    .reduce((sum, r) => sum + Number(r.original.amount), 0)
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0
  const sideColumn = table.getColumn("side")

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <JournalDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.summaryDesignation}
      toolbar={
        <ContentToolbarLegacy
          left={
            <>
              {sideColumn ? (
                <DataTableFacetedFilter
                  column={sideColumn}
                  title="Side"
                  options={[
                    { label: "MD (debit)", value: "DEBIT" },
                    { label: "Dal (credit)", value: "CREDIT" },
                  ]}
                  multiple
                />
              ) : null}
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder="Search deník…"
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
                {visible.length} {visible.length === 1 ? "line" : "lines"}
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Sigma className="size-3.5" aria-hidden />
                <span className="tabular-nums">
                  {formatDecimal(String(debitTotal))}
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
