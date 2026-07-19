import type { Column, Row, Table } from "@tanstack/react-table"

import { toast } from "@workspace/ui/components/sonner"

import type { ContentFooterAction } from "./content-footer"

/** CSV-escape one cell (quote when it contains a comma, quote, or newline). */
function csvCell(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The export header for one column — its own label, prefixed by any banded parent
 * group labels (e.g. a Pivot month band) so a leaf reads `"2026-01 · Total"`
 * rather than an ambiguous bare `"Total"`. A flat column has no parent group, so
 * it is just the leaf label.
 */
function columnExportLabel<TData>(column: Column<TData, unknown>): string {
  const bands: string[] = []
  for (let parent = column.parent; parent; parent = parent.parent) {
    const label = parent.columnDef.meta?.label
    if (typeof label === "string" && label) bands.unshift(label)
  }
  const leaf = String(column.columnDef.meta?.label ?? column.id)
  return [...bands, leaf].join(" · ")
}

/**
 * A CSV of the SELECTED rows × the VISIBLE data columns, both in their current
 * on-screen order — the whole selected range, exactly as placed. Display columns
 * (selection checkbox, row actions) carry no `accessorFn` and are dropped, so the
 * header/body stay aligned to real data columns for a flat Table or a Pivot alike.
 *
 * Headers are band-qualified (a Pivot's column-dimension tiers), and each selected
 * row's DESCENDANTS are walked too — a Pivot's `rows` are the top-level groups
 * only, with the sub-rows + subtotals in `subRows`, so exporting the selection
 * yields the FULL table, not just the group headers. A flat Table has no `subRows`,
 * so this stays a single pass over the selected rows.
 */
export function selectionCsv<TData>(table: Table<TData> | null): string {
  const columns = (table?.getVisibleLeafColumns() ?? []).filter(
    (column) => column.accessorFn != null,
  )
  const header = columns.map((column) => csvCell(columnExportLabel(column)))
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

export interface BuildTableFooterOptions {
  /**
   * Include the standard Export action — a segmented ButtonGroup of
   * "Copy to clipboard" | "Export as CSV", both over the selected rows × visible
   * columns. Default true, so a Table (flat OR pivot) can never ship WITHOUT the
   * Export affordance: the shape lives here at the design-system level and every
   * page gets it by calling this, exactly like `buildTableToolbar`.
   */
  export?: boolean
  /** CSV download filename (without extension). Default `"export"`. */
  exportFileName?: string
  /** Extra actions appended AFTER Export (e.g. a page-specific Delete). */
  actions?: ContentFooterAction[]
}

/**
 * Assemble a standard Table `ContentFooterAction[]` from page-level intent — the
 * selection-footer counterpart to `buildTableToolbar`. The Export action's
 * clipboard/CSV plumbing is generic (derived from the live table), so it is owned
 * here, not re-authored per page; the page only supplies extra actions (Delete)
 * and data. Call it inside the archetype's `selectionActions={(table) => …}`.
 *
 * ```ts
 * selectionActions={(table) => buildTableFooter(table, {
 *   actions: [{ id: "delete", label: "Delete", icon: "Trash2",
 *               variant: "destructive", onSelect: () => …del… }],
 * })}
 * ```
 */
export function buildTableFooter<TData>(
  table: Table<TData> | null,
  opts: BuildTableFooterOptions = {},
): ContentFooterAction[] {
  const actions: ContentFooterAction[] = []

  if (opts.export ?? true) {
    const fileName = opts.exportFileName ?? "export"
    // A split button (shadcn ButtonGroup + DropdownMenu): the primary click
    // downloads the CSV; the attached chevron opens the alternative(s).
    actions.push({
      id: "export",
      label: "Export as CSV",
      icon: "FileDown",
      onSelect: () => {
        const url = URL.createObjectURL(
          new Blob([selectionCsv(table)], { type: "text/csv" }),
        )
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `${fileName}.csv`
        anchor.click()
        URL.revokeObjectURL(url)
        toast.success("Exported CSV")
      },
      menu: [
        {
          id: "clipboard",
          label: "Copy to clipboard",
          icon: "Copy",
          onSelect: () => {
            void navigator.clipboard.writeText(selectionCsv(table))
            toast.success(
              `Copied ${table?.getFilteredSelectedRowModel().rows.length ?? 0} row(s)`,
            )
          },
        },
      ],
    })
  }

  if (opts.actions) actions.push(...opts.actions)

  return actions
}
