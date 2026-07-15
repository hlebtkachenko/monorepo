import type { Column, ColumnSort, RowData } from "@tanstack/react-table"

export type DataTableFilterVariant =
  "text" | "number" | "range" | "date" | "dateRange" | "select" | "multiSelect"

export interface DataTableFilterOption {
  label: string
  value: string
  count?: number
  icon?: React.FC<React.SVGProps<SVGSVGElement>>
}

export interface DataTableColumnMeta {
  label?: string
  placeholder?: string
  variant?: DataTableFilterVariant
  options?: DataTableFilterOption[]
  range?: [number, number]
  unit?: string
  icon?: React.FC<React.SVGProps<SVGSVGElement>>
  /** Cell content alignment — `center` squares up icon/checkbox columns. */
  align?: "start" | "center" | "end"
  /**
   * Whether the grid's keyboard cell-focus can land on this column. Default
   * true. The select column sets it false so it is never a focusable/"selected"
   * cell (no focus ring, arrow-nav skips it).
   */
  focusable?: boolean
  /**
   * Whether this column's cells are inline-editable — the grid gives a focused
   * cell here a white surface so it reads as an editable field.
   */
  editable?: boolean
  /**
   * Extra px this column's cell reserves AFTER its value (e.g. a trailing
   * action button). Double-click auto-fit adds it so the fit shows the full
   * text PLUS the button without overlap.
   */
  trailingWidth?: number
  /**
   * Suppress drag-to-reorder for this header even though it is otherwise
   * interactive (sortable/hideable). Set on pivot columns: the derived
   * group/measure columns keep sorting but must not be dragged out of their
   * hierarchy (the header layers are structural, not user-reorderable).
   */
  disableReorder?: boolean
  /**
   * Render a self-contained numeric min/max filter INSIDE this column's header
   * dropdown, wired to TanStack's own `columnFilters` (via `setFilterValue`).
   * Used by pivot value columns: their derived ids (`val…`) can't route to the
   * bazza toolbar, so filtering lives on the column itself. Requires the column
   * to `enableColumnFilter` + the table to have `getFilteredRowModel`.
   */
  inlineNumberFilter?: boolean
  /**
   * The id the header's "Filter" action should route to instead of the column's
   * own id — used by pivot GROUP headers (a `grp…` column standing in for a
   * column-dimension VALUE): the dropdown Filter opens the toolbar filter for the
   * underlying DIMENSION FIELD (e.g. "channel"), which `resolveHeaderFilterTarget`
   * can match against the toolbar's filter columns.
   */
  filterColumnId?: string
}

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: required to extend the upstream type
  interface ColumnMeta<
    TData extends RowData,
    TValue,
  > extends DataTableColumnMeta {}
}

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>
}

export function getColumnPinningStyle<TData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>
  withBorder?: boolean
}): React.CSSProperties {
  const isPinned = column.getIsPinned()
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left")
  const isFirstRightPinnedColumn =
    isPinned === "right" && column.getIsFirstColumn("right")

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? "-4px 0 4px -4px var(--border) inset"
        : isFirstRightPinnedColumn
          ? "4px 0 4px -4px var(--border) inset"
          : undefined
      : undefined,
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "var(--background)" : undefined,
    width: column.getSize(),
    zIndex: isPinned ? 1 : undefined,
  }
}

export function getColumnLabel<TData>(
  column: Column<TData> | undefined,
): string {
  if (!column) return ""
  const meta = column.columnDef.meta
  if (meta?.label) return meta.label
  const header = column.columnDef.header
  if (typeof header === "string") return header
  return column.id
}
