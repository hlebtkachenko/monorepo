import type { Row, Table } from "@tanstack/react-table"

import { toast } from "@workspace/ui/components/sonner"

import type {
  ContentFooterAction,
  ContentFooterActionMenuGroup,
  ContentFooterActionMenuItem,
} from "./content-footer"

/** CSV-escape one cell (quote when it contains a comma, quote, or newline). */
function csvCell(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A CSV of the SELECTED rows × the VISIBLE data columns, both in their current
 * on-screen order — the whole selected range, exactly as placed. Display columns
 * (selection checkbox, row actions) carry no `accessorFn` and are dropped, so the
 * header/body stay aligned to the real data columns. Each selected row's
 * DESCENDANTS are walked too (a nested/pivot row keeps its children in `subRows`);
 * a flat Table has none, so this stays a single pass. A page whose grid needs a
 * bespoke layout (e.g. a Pivot's dimension columns + band header line) passes its
 * own `toCsv` to `buildTableFooter` instead of this default.
 */
export function selectionCsv<TData>(table: Table<TData> | null): string {
  const columns = (table?.getVisibleLeafColumns() ?? []).filter(
    (column) => column.accessorFn != null,
  )
  const header = columns.map((column) =>
    csvCell(column.columnDef.meta?.label ?? column.id),
  )
  const body: string[][] = []
  const walk = (rows: readonly Row<TData>[]) => {
    for (const row of rows) {
      body.push(columns.map((column) => csvCell(row.getValue(column.id))))
      if (row.subRows.length) walk(row.subRows)
    }
  }
  walk(table?.getFilteredSelectedRowModel().rows ?? [])
  return [header, ...body].map((cells) => cells.join(",")).join("\n")
}

export interface BuildTableFooterOptions<TData> {
  /**
   * Include the standard Export split button. Default true, so a Table (flat OR
   * pivot) can never ship WITHOUT the Export affordance: the shape lives here at
   * the design-system level and every page gets it by calling this, exactly like
   * `buildTableToolbar`.
   */
  export?: boolean
  /** CSV download filename (without extension). Default `"export"`. */
  exportFileName?: string
  /**
   * Override the CSV serialization (for the download, clipboard, and Export-as-CSV
   * item). Defaults to {@link selectionCsv}. A Pivot passes its own to emit real
   * dimension columns + a band header line instead of the flat default.
   */
  toCsv?: (table: Table<TData> | null) => string
  /** The selected rows' ids, in on-screen order — feeds the Copy link/id + the
   *  single-select "Open in Inspector" item. Omit any of the callbacks below to
   *  hide that item (e.g. a Pivot has no per-row links or inspector). */
  selectedIds?: string[]
  /** Copy a link for the selected row(s) — renders "Copy link". */
  onCopyLink?: (ids: string[]) => void
  /** Copy the id(s) of the selected row(s) — renders "Copy ID". */
  onCopyId?: (ids: string[]) => void
  /** Open the row's Inspector on its Export tab — renders "Open in Inspector",
   *  shown ONLY when exactly one row is selected. */
  onOpenInspector?: (id: string) => void
  /** Extra actions appended AFTER Export (e.g. a page-specific Delete). */
  actions?: ContentFooterAction[]
}

/**
 * Assemble a standard Table `ContentFooterAction[]` from page-level intent — the
 * selection-footer counterpart to `buildTableToolbar`. Export is a split button:
 * the primary click downloads the CSV; the chevron opens a GROUPED dropdown —
 * "Export as" (CSV), "Copy" (clipboard / link / id), and a single-select "More"
 * ("Open in Inspector"). The clipboard/CSV plumbing is generic (derived from the
 * live table); the page supplies only data + the link/id/inspector callbacks.
 * Call it inside the archetype's `selectionActions={(table) => …}`.
 */
export function buildTableFooter<TData>(
  table: Table<TData> | null,
  opts: BuildTableFooterOptions<TData> = {},
): ContentFooterAction[] {
  const actions: ContentFooterAction[] = []

  if (opts.export ?? true) {
    const fileName = opts.exportFileName ?? "export"
    const toCsv = opts.toCsv ?? selectionCsv
    const ids = opts.selectedIds ?? []
    // `flatRows` (not `.rows`) so a nested/pivot selection counts its descendants,
    // matching what the CSV actually contains — the flat Table passes `ids` anyway.
    const selectedCount =
      ids.length || (table?.getFilteredSelectedRowModel().flatRows.length ?? 0)

    const downloadCsv = () => {
      const url = URL.createObjectURL(
        new Blob([toCsv(table)], { type: "text/csv" }),
      )
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${fileName}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success("Exported CSV")
    }

    const copyGroup: ContentFooterActionMenuItem[] = [
      {
        id: "clipboard",
        label: "Copy to clipboard",
        icon: "Copy",
        onSelect: () => {
          void navigator.clipboard.writeText(toCsv(table))
          toast.success(`Copied ${selectedCount} row(s)`)
        },
      },
    ]
    if (opts.onCopyLink)
      copyGroup.push({
        id: "copy-link",
        label: "Copy link",
        icon: "LinkIcon",
        onSelect: () => opts.onCopyLink!(ids),
      })
    if (opts.onCopyId)
      copyGroup.push({
        id: "copy-id",
        label: "Copy ID",
        icon: "IdCard",
        onSelect: () => opts.onCopyId!(ids),
      })

    const menuGroups: ContentFooterActionMenuGroup[] = [
      {
        id: "export-as",
        label: "Export as",
        items: [
          { id: "csv", label: "CSV", icon: "FileDown", onSelect: downloadCsv },
        ],
      },
      { id: "copy", label: "Copy", items: copyGroup },
    ]
    // "Open in Inspector" only makes sense for a single record — hidden on
    // multi-select (and absent when the page has no inspector).
    if (opts.onOpenInspector && ids.length === 1)
      menuGroups.push({
        id: "more",
        label: "More",
        items: [
          {
            id: "open-inspector",
            label: "Open in Inspector",
            icon: "Maximize2",
            onSelect: () => opts.onOpenInspector!(ids[0]!),
          },
        ],
      })

    actions.push({
      id: "export",
      label: "Export",
      icon: "FileDown",
      onSelect: downloadCsv,
      menuGroups,
    })
  }

  if (opts.actions) actions.push(...opts.actions)

  return actions
}
