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
import { companyColumns } from "./columns"
import { CompaniesTableToolbar } from "./companies-table-toolbar"
import { useCompanies } from "./context"
import {
  applySearch,
  COMPANY_TABS,
  STATUS_BADGE,
  type CompanyRow,
} from "./data"

/** Inspector content — the detail of the selected company. */
function CompanyDetail({ row }: { row: CompanyRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Type" value={row.typeLabel} />
      <DetailField label="VAT regime" value={row.vatRegime} />
      <DetailField label="Fiscal year" value={row.fiscalYear} />
      <DetailField
        label="Status"
        value={<Badge variant={STATUS_BADGE[row.status]}>{row.status}</Badge>}
      />
      <DetailField label="Next deadline" value={row.nextDeadline} />
      <DetailField label="Assigned" value={row.assignee} />
      <DetailField label="Handle" value={`/${row.slug}`} />
    </dl>
  )
}

/**
 * Companies body — the Table archetype on the workspace shell. Real company rows
 * (resolved server-side) drive a TanStack `DataGridView`: tab-filtered by
 * status, a universal search, the faceted Status filter, row selection with a
 * bulk `ActionBar`, and a per-row `Inspector`. Mounts as the shell `children`.
 */
export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  const icons = useIcons()
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useCompanies()

  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = COMPANY_TABS.find((t) => t.value === activeTab)
    if (!tab?.status) return companies
    return companies.filter((row) => row.status === tab.status)
  }, [activeTab, companies])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<CompanyRow>({
    data,
    columns: companyColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 480 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 15 },
      columnPinning: { left: ["select"], right: ["open", "inspect"] },
    },
  })

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0

  const ArchiveIcon = icons.Archive
  const ExportIcon = icons.Download

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <CompanyDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.legalName}
      toolbar={
        <CompaniesTableToolbar
          table={table}
          search={search}
          onSearchChange={setSearch}
        />
      }
      statusBar={
        <TableStatusBar
          table={table}
          noun="company"
          nounPlural="companies"
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
                toast("Export — coming soon")
                table.resetRowSelection()
              }}
            >
              <ExportIcon />
              Export
            </ActionBarItem>
            <ActionBarItem
              onSelect={() => {
                toast("Archive — coming soon")
                table.resetRowSelection()
              }}
            >
              <ArchiveIcon />
              Archive
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      }
    >
      <DataGridView table={table} className="min-h-0 flex-1" />
    </ContentPanel>
  )
}
