"use client"

import * as React from "react"
import type {
  ColumnSort,
  Header,
  SortDirection,
  Table,
} from "@tanstack/react-table"

import {
  ArrowDown,
  ArrowLeft,
  ArrowRightIcon,
  ArrowUp,
  ChevronsUpDown,
  EyeOff,
  FilterIcon,
  Pin,
  PinOff,
  Sparkles,
  X,
} from "@workspace/ui/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

/** The visible name of a column — `meta.label`, a string header, or the id. */
function getColumnLabel<TData, TValue>(header: Header<TData, TValue>): string {
  const { column } = header
  const meta = column.columnDef.meta
  if (meta?.label) return meta.label
  const def = column.columnDef.header
  if (typeof def === "string") return def
  return column.id
}

/** The current column order, falling back to the natural leaf order. */
function getFullOrder<TData>(table: Table<TData>): string[] {
  const order = table.getState().columnOrder
  return order.length > 0 ? order : table.getAllLeafColumns().map((c) => c.id)
}

/** Ids of the reorderable (non-pinned) columns, in their current order. */
export function getCenterIds<TData>(table: Table<TData>): string[] {
  return getFullOrder(table).filter((id) => !table.getColumn(id)?.getIsPinned())
}

/** Re-emit the column order with the center group changed, pins kept at edges. */
export function commitCenter<TData>(
  table: Table<TData>,
  nextCenter: string[],
): void {
  const full = getFullOrder(table)
  const left = full.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "left",
  )
  const right = full.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "right",
  )
  table.setColumnOrder([...left, ...nextCenter, ...right])
}

/**
 * Re-emit `columnPinning` with one pinned group reordered. The controlled
 * pinning in `useDataTable` runs its normalizer on the result (e.g. the Table
 * section re-anchors `select` first / `actions` last), so a within-group drag
 * can never dislodge a structural column.
 */
export function commitPinnedGroup<TData>(
  table: Table<TData>,
  side: "left" | "right",
  nextGroup: string[],
): void {
  table.setColumnPinning((prev) => ({ ...prev, [side]: nextGroup }))
}

/** Move `columnId` to `toIndex` within the center group (used by the menu). */
function moveColumn<TData>(
  table: Table<TData>,
  columnId: string,
  toIndex: number,
): void {
  const center = getCenterIds(table)
  const from = center.indexOf(columnId)
  if (from < 0 || toIndex < 0 || toIndex >= center.length) return
  const next = [...center]
  const [moved] = next.splice(from, 1)
  if (moved == null) return
  next.splice(toIndex, 0, moved)
  commitCenter(table, next)
}

interface DataGridViewColumnHeaderProps<TData, TValue> {
  header: Header<TData, TValue>
  table: Table<TData>
  /** Opens this column's filter editor (shows the "Filter" item when set). */
  onColumnFilter?: (columnId: string) => void
  /** Sends this column to Sidekick (shows the "AI analyze" item when set). */
  onColumnAnalyze?: (columnId: string) => void
}

/**
 * A column header with the interactions living on the column name itself: a
 * dropdown to analyze, sort, filter, pin, move, and hide the column, plus a
 * resize handle on the trailing edge. Reordering is by dragging the header's
 * grip handle (dnd-kit, wired by `SortableHeaderCell`) or the Move left/right
 * menu items. Every action writes to the shared TanStack `table`, so toolbar
 * controls (Sort, Hide) stay in sync automatically. A `ChevronsUpDown` glyph on
 * the name marks the column as configurable.
 */
export function DataGridViewColumnHeader<TData, TValue>({
  header,
  table,
  onColumnFilter,
  onColumnAnalyze,
}: DataGridViewColumnHeaderProps<TData, TValue>) {
  const { column } = header
  const label = getColumnLabel(header)
  const sorted = column.getIsSorted()
  const pinned = column.getIsPinned()
  const canSort = column.getCanSort()
  const canHide = column.getCanHide()
  const canPin = column.getCanPin()
  const canResize = column.getCanResize()
  const isResizing =
    table.getState().columnSizingInfo.isResizingColumn !== false
  const canReorder = (canSort || canHide) && !pinned

  const center = getCenterIds(table)
  const pos = center.indexOf(column.id)
  const canMoveLeft = canReorder && pos > 0
  const canMoveRight = canReorder && pos >= 0 && pos < center.length - 1

  const setSort = React.useCallback(
    (direction: SortDirection) => {
      table.setSorting((prev) => {
        const next: ColumnSort = { id: column.id, desc: direction === "desc" }
        const i = prev.findIndex((s) => s.id === column.id)
        if (i >= 0) {
          const copy = [...prev]
          copy[i] = next
          return copy
        }
        return [...prev, next]
      })
    },
    [column.id, table],
  )

  const clearSort = React.useCallback(() => {
    table.setSorting((prev) => prev.filter((s) => s.id !== column.id))
  }, [column.id, table])

  return (
    <>
      {/* Plain wrapper for the dropdown; reorder drag lives on the grip handle
          in SortableHeaderCell. `pointer-events-none` while resizing keeps the
          menu from opening mid-drag of the resize handle. */}
      <div
        className={cn(
          "flex size-full items-center",
          isResizing && "pointer-events-none",
        )}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger className="group/header flex size-full items-center justify-between gap-1 px-3 text-start text-sm font-medium text-foreground outline-none hover:bg-foreground/5 data-[state=open]:bg-foreground/5">
            <span className="truncate">{label}</span>
            {sorted === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" />
            ) : sorted === "desc" ? (
              <ArrowDown className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/70" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {onColumnAnalyze ? (
              <>
                <DropdownMenuItem onSelect={() => onColumnAnalyze(column.id)}>
                  <Sparkles className="text-purple" />
                  AI analyze
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {canSort ? (
              <>
                <DropdownMenuItem onSelect={() => setSort("asc")}>
                  <ArrowUp />
                  Sort ascending
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSort("desc")}>
                  <ArrowDown />
                  Sort descending
                </DropdownMenuItem>
                {sorted ? (
                  <DropdownMenuItem onSelect={clearSort}>
                    <X />
                    Clear sort
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
            {onColumnFilter ? (
              <DropdownMenuItem onSelect={() => onColumnFilter(column.id)}>
                <FilterIcon />
                Filter
              </DropdownMenuItem>
            ) : null}
            {canPin ? (
              <>
                <DropdownMenuSeparator />
                {pinned === "left" ? (
                  <DropdownMenuItem onSelect={() => column.pin(false)}>
                    <PinOff />
                    Unpin from left
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => column.pin("left")}>
                    <Pin />
                    Pin to left
                  </DropdownMenuItem>
                )}
                {pinned === "right" ? (
                  <DropdownMenuItem onSelect={() => column.pin(false)}>
                    <PinOff />
                    Unpin from right
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => column.pin("right")}>
                    <Pin />
                    Pin to right
                  </DropdownMenuItem>
                )}
              </>
            ) : null}
            {canReorder ? (
              <>
                <DropdownMenuItem
                  disabled={!canMoveLeft}
                  onSelect={() => moveColumn(table, column.id, pos - 1)}
                >
                  <ArrowLeft />
                  Move left
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canMoveRight}
                  onSelect={() => moveColumn(table, column.id, pos + 1)}
                >
                  <ArrowRightIcon />
                  Move right
                </DropdownMenuItem>
              </>
            ) : null}
            {canHide ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => column.toggleVisibility(false)}
                >
                  <EyeOff />
                  Hide column
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {canResize ? <DataGridViewColumnResizer header={header} /> : null}
    </>
  )
}

/** Drag handle on the trailing edge — drag to resize, double-click to reset. */
function DataGridViewColumnResizer<TData, TValue>({
  header,
}: {
  header: Header<TData, TValue>
}) {
  const resize = header.getResizeHandler()
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      data-resizing={header.column.getIsResizing() ? "" : undefined}
      onMouseDown={resize}
      onTouchStart={resize}
      onDoubleClick={() => header.column.resetSize()}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize touch-none bg-transparent transition-colors select-none hover:bg-primary/60",
        "data-[resizing]:bg-primary",
      )}
    />
  )
}
