"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  DetailField,
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
import { chartColumns } from "./columns"
import { useChart } from "./context"
import { ACCOUNT_TABS, type AccountRow } from "./data"

function applySearch(rows: AccountRow[], query: string): AccountRow[] {
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
  OFF_BALANCE: "Podrozvaha",
}

function normalBalanceLabel(value: AccountRow["normalBalance"]): string {
  if (value === "DEBIT") return "MD"
  if (value === "CREDIT") return "Dal"
  return "—"
}

function AccountDetail({ row }: { row: AccountRow }) {
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
        label="Normal balance"
        value={
          <span className="tabular-nums">
            {normalBalanceLabel(row.normalBalance)}
          </span>
        }
      />
      <DetailField
        label="Saldokonto"
        value={
          <Badge variant={row.tracksOpenItems ? "outline" : "secondary"}>
            {row.tracksOpenItems ? "Ano" : "Ne"}
          </Badge>
        }
      />
    </dl>
  )
}

/**
 * Účtový rozvrh (chart of accounts) body — per-account number | name | nature |
 * normal balance | saldokonto tracking from the chart. Table archetype:
 * `useDataTable` + `DataGridView` in a `ContentPanel` with search + Nature
 * filter, a status bar counting accounts, and a per-account inspector. Rows
 * come from the server page via props.
 */
export function ChartBody({ rows }: { rows: AccountRow[] }) {
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useChart()
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = ACCOUNT_TABS.find((t) => t.value === activeTab)
    if (!tab?.natures) return rows
    const set = new Set<string>(tab.natures)
    return rows.filter((row) => set.has(row.nature))
  }, [rows, activeTab])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<AccountRow>({
    data,
    columns: chartColumns,
    getRowId: (row) => row.accountId,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 130, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  const visible = table.getFilteredRowModel().rows
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
