import type { Column, ColumnSort, RowData } from "@tanstack/react-table"

export type DataTableFilterVariant =
  | "text"
  | "number"
  | "range"
  | "date"
  | "dateRange"
  | "select"
  | "multiSelect"

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
