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

import { formatDecimal, normalizeSearch } from "../_shared/accounting-format"
import { ledgerColumns } from "./columns"
import { useLedger } from "./context"
import { LEDGER_TABS, type LedgerRow } from "./data"

function applySearch(rows: LedgerRow[], query: string): LedgerRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [row.accountNumber, row.accountName, row.nature].some((value) =>
      normalizeSearch(String(value)).includes(q),
    ),
  )
}

const NATURE_LABEL: Record<string, string> = {
  ASSET: "Aktiva",
  LIABILITY: "Pasiva",
  EQUITY: "Kapitál",
  EXPENSE: "Náklady",
  REVENUE: "Výnosy",
  CLOSING: "Uzávěrka",
}

function AccountDetail({ row }: { row: LedgerRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Account" value={row.accountNumber} />
      <DetailField label="Name" value={row.accountName} />
      <DetailField
        label="Nature"
        value={
          <Badge variant="outline">
            {NATURE_LABEL[row.nature] ?? row.nature}
          </Badge>
        }
      />
      <DetailField
        label="Opening"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.openingBalance)}
          </span>
        }
      />
      <DetailField
        label="Turnover MD"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.turnoverDebit)}
          </span>
        }
      />
      <DetailField
        label="Turnover Dal"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.turnoverCredit)}
          </span>
        }
      />
      <DetailField
        label="Closing"
        value={
          <span className="tabular-nums">
            {formatDecimal(row.closingBalance)}
          </span>
        }
      />
    </dl>
  )
}

/**
 * Hlavní kniha / obratová předvaha body — per-account opening | turnover MD/Dal
 * | closing from the read-model. Table archetype: `useDataTable` +
 * `DataGridView` in a `ContentPanel` with search + Nature filter, a status bar
 * summing debit/credit turnover, and a per-account inspector. Rows come from
 * the server page (route `page.tsx`).
 */
export function LedgerBody({ rows }: { rows: LedgerRow[] }) {
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useLedger()
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = LEDGER_TABS.find((t) => t.value === activeTab)
    if (!tab?.natures) return rows
    const set = new Set<string>(tab.natures)
    return rows.filter((row) => set.has(row.nature))
  }, [rows, activeTab])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<LedgerRow>({
    data,
    columns: ledgerColumns,
    getRowId: (row) => row.accountId,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 130, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
  const mdTotal = visible.reduce(
    (sum, r) => sum + Number(r.original.turnoverDebit),
    0,
  )
  const dalTotal = visible.reduce(
    (sum, r) => sum + Number(r.original.turnoverCredit),
    0,
  )
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0
  const natureColumn = table.getColumn("nature")

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <AccountDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.accountNumber}
      toolbar={
        <ContentToolbar
          left={
            <>
              {natureColumn ? (
                <DataTableFacetedFilter
                  column={natureColumn}
                  title="Nature"
                  options={Object.entries(NATURE_LABEL).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  multiple
                />
              ) : null}
              <div className="relative flex h-7 w-72 items-center">
                <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts…"
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
                {visible.length} {visible.length === 1 ? "account" : "accounts"}
              </span>
              {isFiltered ? (
                <Badge variant="secondary" className="h-5">
                  Filtered
                </Badge>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Sigma className="size-3.5" aria-hidden />
                <span className="tabular-nums">
                  MD {formatDecimal(String(mdTotal))} · Dal{" "}
                  {formatDecimal(String(dalTotal))}
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
