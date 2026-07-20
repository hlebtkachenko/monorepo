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
   * Body-cell inline padding. Default (`undefined`) keeps the standard `px-3`
   * inset. `"none"` drops it to `px-0` — used by the Tree-table's identity
   * column so its chevron sits flush at the cell's left edge and the whole cell
   * is one click target. Applies to BODY cells only; the header keeps its inset.
   */
  cellPadding?: "none"
  /**
   * Suppress drag-to-reorder for this header even though it is otherwise
   * interactive (sortable/hideable). Set on pivot columns: the derived
   * group/measure columns keep sorting but must not be dragged out of their
   * hierarchy (the header layers are structural, not user-reorderable).
   */
  disableReorder?: boolean
  /**
   * The id the header's "Filter" action should route to instead of the column's
   * own id. Used by pivot columns so same-meaning columns across groups open ONE
   * toolbar filter: a GROUP header (a `grp…` column) passes its column-dimension
   * FIELD (e.g. "channel"); a VALUE column passes its measure FIELD (e.g.
   * "amount"), so every Amount column across every group routes to the same
   * Amount toolbar filter. `resolveHeaderFilterTarget` matches it to a toolbar
   * filter column.
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
