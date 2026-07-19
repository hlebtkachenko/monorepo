import type { Table } from "@tanstack/react-table"

import { toast } from "@workspace/ui/components/sonner"

import type { ContentFooterAction } from "./content-footer"

/** CSV-escape one cell (quote when it contains a comma, quote, or newline). */
function csvCell(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A CSV of the SELECTED rows × the VISIBLE data columns, both in their current
 * on-screen order — the whole selected range, exactly as placed. Display columns
 * (selection checkbox, row actions) carry no `accessorFn` and are dropped, so the
 * header/body stay aligned to real data columns for a flat Table or a Pivot alike.
 */
export function selectionCsv<TData>(table: Table<TData> | null): string {
  const columns = (table?.getVisibleLeafColumns() ?? []).filter(
    (column) => column.accessorFn != null,
  )
  const rows = table?.getFilteredSelectedRowModel().rows ?? []
  const header = columns.map((column) =>
    csvCell(column.columnDef.meta?.label ?? column.id),
  )
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row.getValue(column.id))),
  )
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
    actions.push({
      id: "export",
      label: "Export",
      group: [
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
        {
          id: "csv",
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
        },
      ],
    })
  }

  if (opts.actions) actions.push(...opts.actions)

  return actions
}
