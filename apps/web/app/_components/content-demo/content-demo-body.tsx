"use client"

import * as React from "react"

import {
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
} from "@workspace/ui/blocks/app-content"
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Button } from "@workspace/ui/components/button"
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  useDataTable,
} from "@workspace/ui/components/data-table"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons } from "@workspace/ui/icon-packs"

import { fakturyColumns } from "./columns"
import { useOrgContent } from "./context"
import { FAKTURY_ROWS, FAKTURY_TABS, formatCzk, type FakturaRow } from "./data"

/**
 * TEMP — the Content Panel body for the Faktury přijaté demo. A full-width data
 * table wired to: the header tabs (filters the rows), the toolbar (filter
 * toggle + add), the status bar (totals), and the floating ActionBar (bulk
 * actions on selection). Mounts as the app-shell `children`.
 */
export function ContentDemoBody() {
  const icons = useIcons()
  const { activeTab, filtersOpen, toggleFilters, showToolbarActions } =
    useOrgContent()

  const data = React.useMemo(() => {
    const tab = FAKTURY_TABS.find((t) => t.value === activeTab)
    if (!tab?.kind) return FAKTURY_ROWS
    return FAKTURY_ROWS.filter((row) => row.kind === tab.kind)
  }, [activeTab])

  const { table } = useDataTable<FakturaRow>({
    data,
    columns: fakturyColumns,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  })

  const filteredRows = table.getFilteredRowModel().rows
  const total = filteredRows.reduce((sum, r) => sum + r.original.castka, 0)
  const toMatch = filteredRows.filter((r) => r.original.keSparovani).length
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  const PlusIcon = icons.Plus
  const DownloadIcon = icons.Download
  const RefreshIcon = icons.RefreshCw
  const MatchIcon = icons.LinkIcon
  const EditIcon = icons.Pencil
  const DeleteIcon = icons.Trash2

  return (
    <ContentPanel
      toolbar={
        <ContentToolbar
          left={
            <span className="px-1 text-xs text-muted-foreground tabular-nums">
              {filteredRows.length} dokladů
            </span>
          }
          right={
            showToolbarActions ? (
              <>
                <IconButton
                  icon="FilterIcon"
                  active={filtersOpen}
                  aria-label="Filtrovat"
                  tooltip="Filtrovat"
                  tooltipSide="bottom"
                  onClick={toggleFilters}
                />
                <Button size="sm">
                  <PlusIcon />
                  Přidat doklad
                </Button>
              </>
            ) : null
          }
        />
      }
      filters={
        filtersOpen ? (
          <div className="shrink-0 border-b border-border-subtle px-2 py-2">
            <DataTableToolbar table={table} />
          </div>
        ) : null
      }
      statusBar={
        <ContentStatusBar
          left={
            <>
              <span className="tabular-nums">Σ {formatCzk(total)}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {filteredRows.length} dokladů
              </span>
              {toMatch > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-foreground tabular-nums">
                    {toMatch} ke spárování
                  </span>
                </>
              ) : null}
            </>
          }
          right={
            <>
              <Button variant="ghost" size="icon-xs" aria-label="Exportovat">
                <DownloadIcon />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Obnovit">
                <RefreshIcon />
              </Button>
            </>
          }
        />
      }
      actionBar={
        <ActionBar
          open={selectedCount > 0}
          onOpenChange={(open) => {
            if (!open) table.resetRowSelection()
          }}
          aria-label="Hromadné akce"
        >
          <ActionBarSelection>{selectedCount} vybráno</ActionBarSelection>
          <ActionBarSeparator />
          <ActionBarGroup>
            <ActionBarItem onSelect={() => table.resetRowSelection()}>
              <MatchIcon />
              Spárovat
            </ActionBarItem>
            <ActionBarItem onSelect={() => table.resetRowSelection()}>
              <EditIcon />
              Upravit
            </ActionBarItem>
            <ActionBarItem
              variant="destructive"
              onSelect={() => table.resetRowSelection()}
            >
              <DeleteIcon />
              Smazat
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      }
    >
      <div className="flex flex-col gap-2.5">
        <DataTable table={table} />
        <DataTablePagination table={table} pageSizeOptions={[10, 20, 50]} />
      </div>
    </ContentPanel>
  )
}
