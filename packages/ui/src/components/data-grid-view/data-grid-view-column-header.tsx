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

/** Which side of a column the dragged column will land on. */
export type ColumnDropSide = "before" | "after"

/** The live drop position while a column is being dragged. */
export interface ColumnDropTarget {
  columnId: string
  side: ColumnDropSide
}

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
function getCenterIds<TData>(table: Table<TData>): string[] {
  return getFullOrder(table).filter((id) => !table.getColumn(id)?.getIsPinned())
}

/** Re-emit the column order with the center group changed, pins kept at edges. */
function commitCenter<TData>(table: Table<TData>, nextCenter: string[]): void {
  const full = getFullOrder(table)
  const left = full.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "left",
  )
  const right = full.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "right",
  )
  table.setColumnOrder([...left, ...nextCenter, ...right])
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

/** Drop `sourceId` before/after `targetId` within the center group (used by DnD). */
function reorderRelative<TData>(
  table: Table<TData>,
  sourceId: string,
  targetId: string,
  side: ColumnDropSide,
): void {
  const center = getCenterIds(table)
  const from = center.indexOf(sourceId)
  if (from < 0) return
  const next = [...center]
  const [moved] = next.splice(from, 1)
  if (moved == null) return
  const targetIdx = next.indexOf(targetId)
  if (targetIdx < 0) return
  next.splice(side === "before" ? targetIdx : targetIdx + 1, 0, moved)
  commitCenter(table, next)
}

interface DataGridViewColumnHeaderProps<TData, TValue> {
  header: Header<TData, TValue>
  table: Table<TData>
  /** Opens this column's filter editor (shows the "Filter" item when set). */
  onColumnFilter?: (columnId: string) => void
  /** Sends this column to Sidekick (shows the "AI analyze" item when set). */
  onColumnAnalyze?: (columnId: string) => void
  /** Reports the live drop position during a header drag (for the indicator). */
  onDropTargetChange?: (target: ColumnDropTarget | null) => void
}

/**
 * A column header with the interactions living on the column name itself: a
 * dropdown to analyze, sort, filter, pin, move, and hide the column — plus a
 * resize handle on the trailing edge and HTML drag-and-drop to reorder. Every
 * action writes to the shared TanStack `table`, so toolbar controls (Sort,
 * Hide) stay in sync automatically. A `ChevronsUpDown` glyph on the name marks
 * the column as configurable.
 */
export function DataGridViewColumnHeader<TData, TValue>({
  header,
  table,
  onColumnFilter,
  onColumnAnalyze,
  onDropTargetChange,
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
  const acceptsDrop = !pinned

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

  const onDragStart = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canReorder) return
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", column.id)
    },
    [canReorder, column.id],
  )

  const onDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const side: ColumnDropSide =
        event.clientX < rect.left + rect.width / 2 ? "before" : "after"
      onDropTargetChange?.({ columnId: column.id, side })
    },
    [acceptsDrop, column.id, onDropTargetChange],
  )

  const onDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return
      event.preventDefault()
      onDropTargetChange?.(null)
      const sourceId = event.dataTransfer.getData("text/plain")
      if (!sourceId || sourceId === column.id) return
      const rect = event.currentTarget.getBoundingClientRect()
      const side: ColumnDropSide =
        event.clientX < rect.left + rect.width / 2 ? "before" : "after"
      reorderRelative(table, sourceId, column.id, side)
    },
    [acceptsDrop, column.id, onDropTargetChange, table],
  )

  const onDragEnd = React.useCallback(() => {
    onDropTargetChange?.(null)
  }, [onDropTargetChange])

  return (
    <>
      {/* Drag lives on a plain wrapper (not the Radix trigger, which doesn't
          reliably forward native drag events) so the drop indicator updates. */}
      <div
        draggable={canReorder}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={cn(
          "flex size-full items-center",
          canReorder && "cursor-grab active:cursor-grabbing",
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
