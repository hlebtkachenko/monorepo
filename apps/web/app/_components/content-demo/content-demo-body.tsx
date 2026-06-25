"use client"

import * as React from "react"
import { Banknote, Building2, Calendar, FileText } from "lucide-react"

import { ContentPanel } from "@workspace/ui/blocks/app-content"
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { useDataTable } from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  createColumnConfigHelper,
  dateFilterFn,
  multiOptionFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  useFilterBar,
  type ColumnDataType,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { toast } from "@workspace/ui/components/sonner"
import { useIcons } from "@workspace/ui/icon-packs"

import { invoiceColumns } from "./columns"
import { ContentDemoStatusBar } from "./content-demo-statusbar"
import {
  ColumnManagerMenuContent,
  ContentDemoToolbar,
} from "./content-demo-toolbar"
import { useOrgContent } from "./context"
import {
  INVOICE_ROWS,
  INVOICE_TABS,
  formatDate,
  formatMoney,
  type InvoiceRow,
} from "./data"

const dtf = createColumnConfigHelper<InvoiceRow>()

// Distinct partner names for the Partner option filter (dropdown of all + type).
const PARTNER_OPTIONS = Array.from(
  new Set(INVOICE_ROWS.map((row) => row.partner)),
).map((partner) => ({ value: partner, label: partner }))

// FilterBar columns — Status keeps its own faceted toolbar control; the
// universal Search is separate. The FilterBar owns Document (text), Partner
// (a dropdown of all names), the Amount/VAT sums, and the Date calendar. Each
// one's header "Filter" opens its editor here. Lucide icons are required.
const FB_CONFIG = [
  dtf
    .text()
    .id("document")
    .accessor((row) => row.document)
    .displayName("Document")
    .icon(FileText)
    .build(),
  dtf
    .option()
    .id("partner")
    .accessor((row) => row.partner)
    .displayName("Partner")
    .icon(Building2)
    .options(PARTNER_OPTIONS)
    .build(),
  dtf
    .number()
    .id("amount")
    .accessor((row) => row.amount)
    .displayName("Amount")
    .icon(Banknote)
    .min(-2000)
    .max(40000)
    .build(),
  dtf
    .number()
    .id("vat")
    .accessor((row) => row.vat)
    .displayName("VAT")
    .icon(Banknote)
    .min(-500)
    .max(5000)
    .build(),
  dtf
    .date()
    .id("date")
    .accessor((row) => new Date(row.date))
    .displayName("Date")
    .icon(Calendar)
    .build(),
]

/** The minimal column shape `applyFilters` needs (id + type + accessor). */
type FilterColumnLike = {
  id: string
  type: ColumnDataType
  accessor: (row: InvoiceRow) => unknown
}

/** Client-side application of the FilterBar's filter state to the rows. */
function applyFilters(
  rows: InvoiceRow[],
  filters: FiltersState,
  config: FilterColumnLike[],
): InvoiceRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => {
      const column = config.find((c) => c.id === filter.columnId)
      if (!column) return true
      const value = column.accessor(row)
      switch (filter.type) {
        case "number":
          return numberFilterFn(
            value as number,
            filter as FilterModel<"number">,
          )
        case "date":
          return dateFilterFn(value as Date, filter as FilterModel<"date">)
        case "text":
          return textFilterFn(value as string, filter as FilterModel<"text">)
        case "option":
          return optionFilterFn(
            value as string,
            filter as FilterModel<"option">,
          )
        case "multiOption":
          return multiOptionFilterFn(
            value as string[],
            filter as FilterModel<"multiOption">,
          )
        default:
          return true
      }
    }),
  )
}

// Universal search normalization: drop diacritics, lowercase, and strip spaces
// + `.` / `,` / `-` so "ČEZ", "cez", "C E Z", "12,400" / "12 400", and the
// different date renderings all collapse to the same comparable string.
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s.,-]/g, "")
}

const longMonth = new Intl.DateTimeFormat("en-US", { month: "long" })
const mediumDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

// Every way a user might type a date, concatenated so the same row matches
// "Jun 1", "June", "01.06", "1.6", or "2026-06-01" alike. Parsed as a LOCAL
// date (not `new Date(iso)`, which reads date-only ISO as UTC midnight and
// drifts a day west of UTC) so it matches the displayed cell in every timezone.
function dateSearchText(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  const d = new Date(year, month - 1, day)
  const pad = (n: number) => String(n).padStart(2, "0")
  return [
    iso, // 2026-06-01
    mediumDate.format(d), // Jun 1, 2026
    `${longMonth.format(d)} ${day} ${year}`, // June 1 2026
    `${day}.${month}`, // 1.6
    `${pad(day)}.${pad(month)}.${year}`, // 01.06.2026
  ].join(" ")
}

/** Filter rows by a free-text query matched against every column's value. */
function applySearch(rows: InvoiceRow[], query: string): InvoiceRow[] {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.document,
      row.partner,
      row.status,
      String(row.amount),
      String(row.vat),
      dateSearchText(row.date),
    ].some((value) => normalizeSearch(value).includes(q)),
  )
}

function DetailField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

/** Inspector content — the detail of the chosen invoice. */
function InvoiceDetail({ row }: { row: InvoiceRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailField label="Partner" value={row.partner} />
      <DetailField
        label="Amount"
        value={<span className="tabular-nums">{formatMoney(row.amount)}</span>}
      />
      <DetailField
        label="VAT"
        value={<span className="tabular-nums">{formatMoney(row.vat)}</span>}
      />
      <DetailField label="Date" value={formatDate(row.date)} />
      <DetailField label="Status" value={row.status} />
    </dl>
  )
}

/**
 * TEMP — the Content Panel body for the invoices demo. All column filtering
 * runs through the one FilterBar (`applyFilters`), opened either from the
 * toolbar or per-column from the grid headers; the table handles sort,
 * pagination, selection, and column visibility. Mounts as the app-shell
 * `children`.
 */
export function ContentDemoBody() {
  const icons = useIcons()
  const {
    activeTab,
    inspected,
    inspectorOpen,
    inspectorMode,
    setInspectorMode,
    closeInspector,
  } = useOrgContent()

  const [fbFilters, setFbFilters] = React.useState<FiltersState>([])
  // Controls the FilterBar selector so a column header's "Filter" can open
  // straight to that column's value editor.
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [filterColumnId, setFilterColumnId] = React.useState<
    string | undefined
  >(undefined)
  // Status has its own faceted control; Search is a separate universal filter.
  const [statusFilterOpen, setStatusFilterOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  // The source rows live in state so "Reload" can re-derive them (fresh
  // identities → the table rebuilds) without touching filters / sort / page.
  const [rows, setRows] = React.useState<InvoiceRow[]>(INVOICE_ROWS)

  const tabFiltered = React.useMemo(() => {
    const tab = INVOICE_TABS.find((t) => t.value === activeTab)
    if (!tab?.kind) return rows
    return rows.filter((row) => row.kind === tab.kind)
  }, [activeTab, rows])

  const {
    columns: filterColumns,
    actions: filterActions,
    strategy: filterStrategy,
  } = useFilterBar({
    strategy: "client" as const,
    data: tabFiltered,
    columnsConfig: FB_CONFIG,
    filters: fbFilters,
    onFiltersChange: setFbFilters,
  })

  const data = React.useMemo(
    () => applySearch(applyFilters(tabFiltered, fbFilters, FB_CONFIG), search),
    [tabFiltered, fbFilters, search],
  )

  const { table } = useDataTable<InvoiceRow>({
    data,
    columns: invoiceColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { left: ["select"], right: ["inspect"] },
    },
  })

  // Header "Filter" → route to the right surface: Status to its faceted
  // control, everything else (incl. Partner) to the FilterBar.
  const openColumnFilter = React.useCallback((columnId: string) => {
    if (columnId === "status") {
      setStatusFilterOpen(true)
      return
    }
    setFilterColumnId(columnId)
    setFilterOpen(true)
  }, [])

  // Header "AI analyze" → not wired yet, so reuse the right-click "Ask Sidekick"
  // behavior (copy a prompt to the clipboard + toast).
  const analyzeColumn = React.useCallback(
    (columnId: string) => {
      const label = table.getColumn(columnId)?.columnDef.meta?.label ?? columnId
      void navigator.clipboard
        .writeText(`Analyze the "${label}" column of the incoming invoices`)
        .then(() => toast.success("Sidekick prompt copied"))
        .catch(() => toast.error("Clipboard write failed"))
    },
    [table],
  )

  const filteredRows = table.getFilteredRowModel().rows
  const total = filteredRows.reduce((sum, r) => sum + r.original.amount, 0)
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const isFiltered =
    fbFilters.length > 0 ||
    search.trim() !== "" ||
    table.getState().columnFilters.length > 0

  // Reload re-derives the rows with fresh identities so the table rebuilds,
  // leaving the active filters / sort / pagination untouched.
  const reload = React.useCallback(() => {
    setRows(INVOICE_ROWS.map((row) => ({ ...row })))
    toast.success("Table reloaded")
  }, [])

  const exportAs = React.useCallback(
    (format: string) => {
      toast.success(`Exporting ${filteredRows.length} rows as ${format}…`)
    },
    [filteredRows.length],
  )

  const MatchIcon = icons.LinkIcon
  const EditIcon = icons.Pencil
  const DeleteIcon = icons.Trash2

  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      inspector={inspected ? <InvoiceDetail row={inspected} /> : null}
      inspectorOpen={inspectorOpen}
      inspectorMode={inspectorMode}
      onInspectorOpenChange={(open) => {
        if (!open) closeInspector()
      }}
      inspectorTitle={inspected?.document}
      toolbar={
        <ContentDemoToolbar
          table={table}
          filterColumns={filterColumns}
          filters={fbFilters}
          filterActions={filterActions}
          filterStrategy={filterStrategy}
          selectorOpen={filterOpen}
          onSelectorOpenChange={setFilterOpen}
          selectorProperty={filterColumnId}
          onSelectorPropertyChange={setFilterColumnId}
          statusOpen={statusFilterOpen}
          onStatusOpenChange={setStatusFilterOpen}
          search={search}
          onSearchChange={setSearch}
          inspectorMode={inspectorMode}
          onInspectorModeChange={setInspectorMode}
        />
      }
      statusBar={
        <ContentDemoStatusBar
          table={table}
          visibleCount={filteredRows.length}
          total={total}
          isFiltered={isFiltered}
          onReload={reload}
          onExport={exportAs}
        />
      }
      actionBar={
        <ActionBar
          open={selectedCount > 0}
          onOpenChange={(open) => {
            if (!open) table.resetRowSelection()
          }}
          aria-label="Bulk actions"
          // Float above the status bar: read the clearance the bar publishes,
          // falling back to the ActionBar's natural 16px when no bar is present.
          sideOffset="var(--app-statusbar-clearance, 16px)"
        >
          <ActionBarSelection>{selectedCount} selected</ActionBarSelection>
          <ActionBarSeparator />
          <ActionBarGroup>
            <ActionBarItem onSelect={() => table.resetRowSelection()}>
              <MatchIcon />
              Match
            </ActionBarItem>
            <ActionBarItem onSelect={() => table.resetRowSelection()}>
              <EditIcon />
              Edit
            </ActionBarItem>
            <ActionBarItem
              variant="destructive"
              onSelect={() => table.resetRowSelection()}
            >
              <DeleteIcon />
              Delete
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      }
    >
      <DataGridView
        table={table}
        className="min-h-0 flex-1"
        onColumnFilter={openColumnFilter}
        onColumnAnalyze={analyzeColumn}
        headerTrailing={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="px-3 text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
              >
                + Add column
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <ColumnManagerMenuContent table={table} />
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </ContentPanel>
  )
}
