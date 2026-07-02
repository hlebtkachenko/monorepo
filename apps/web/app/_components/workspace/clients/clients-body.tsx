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

import { clientColumns } from "./columns"
import { ClientsToolbar } from "./clients-toolbar"
import { useClients } from "./context"
import { CLIENT_TABS, type ClientRow } from "./data"

/** Free-text search across the client's readable fields. */
function applySearch(rows: ClientRow[], query: string): ClientRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.legalName,
      row.slug,
      row.typeLabel,
      row.vatRegime,
      row.status,
      row.assignee,
    ].some((value) => value.toLowerCase().includes(q)),
  )
}

/** Inspector content — the detail of the selected client. */
function ClientDetail({ row }: { row: ClientRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Type" value={row.typeLabel} />
      <DetailField label="VAT regime" value={row.vatRegime} />
      <DetailField label="Fiscal year" value={row.fiscalYear} />
      <DetailField
        label="Status"
        value={<Badge variant="secondary">{row.status}</Badge>}
      />
      <DetailField label="Next deadline" value={row.nextDeadline} />
      <DetailField label="Assigned" value={row.assignee} />
      <DetailField label="Handle" value={`/${row.slug}`} />
    </dl>
  )
}

/**
 * Clients body — the Table archetype on the workspace shell. Real client rows
 * (resolved server-side) drive a TanStack `DataGridView`: tab-filtered by
 * status, a universal search, the faceted Status filter, row selection with a
 * bulk `ActionBar`, and a per-row `Inspector`. Mounts as the shell `children`.
 */
export function ClientsBody({ clients }: { clients: ClientRow[] }) {
  const icons = useIcons()
  const { activeTab, inspected, inspectorOpen, inspectorMode, closeInspector } =
    useClients()

  const [statusFilterOpen, setStatusFilterOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const tabFiltered = React.useMemo(() => {
    const tab = CLIENT_TABS.find((t) => t.value === activeTab)
    if (!tab?.status) return clients
    return clients.filter((row) => row.status === tab.status)
  }, [activeTab, clients])

  const data = React.useMemo(
    () => applySearch(tabFiltered, search),
    [tabFiltered, search],
  )

  const { table } = useDataTable<ClientRow>({
    data,
    columns: clientColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 480 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 15 },
      columnPinning: { left: ["select"], right: ["open", "inspect"] },
    },
  })

  const filteredRows = table.getFilteredRowModel().rows
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const isFiltered =
    search.trim() !== "" || table.getState().columnFilters.length > 0

  const ArchiveIcon = icons.Archive
  const ExportIcon = icons.Download

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <ClientDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.legalName}
      toolbar={
        <ClientsToolbar
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
            {filteredRows.length === 1 ? "client" : "clients"}
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
