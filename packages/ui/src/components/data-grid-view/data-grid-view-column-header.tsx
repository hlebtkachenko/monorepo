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
  const align = column.columnDef.meta?.align
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
          <DropdownMenuTrigger
            className={cn(
              "group/header flex size-full items-center gap-1 px-3 text-sm font-medium text-foreground outline-none data-[state=open]:bg-grid-header-hover",
              // Honor the column's alignment so a numeric header sits over its
              // right-aligned cells. `start` keeps the label left with the sort
              // glyph pushed to the far edge (justify-between); end/center group
              // the label + glyph together on that side.
              align === "end"
                ? "justify-end text-end"
                : align === "center"
                  ? "justify-center text-center"
                  : "justify-between text-start",
            )}
          >
            <span className="min-w-0 truncate">{label}</span>
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
      {canResize ? (
        <DataGridViewColumnResizer header={header} table={table} />
      ) : null}
    </>
  )
}

/**
 * Auto-fit a column to the widest of its header label and its cell values —
 * Excel's double-click-the-divider behaviour. Text is measured off-DOM with a
 * canvas using the grid's own computed cell font; the result is clamped to the
 * column's min/max. No-op when there is no 2D canvas (e.g. jsdom).
 */
function autoFitColumn<TData, TValue>(
  header: Header<TData, TValue>,
  table: Table<TData>,
): void {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return
  const sampleCell = document.querySelector<HTMLElement>(
    '[data-slot="grid-cell"]',
  )
  ctx.font = sampleCell
    ? getComputedStyle(sampleCell).font
    : "14px system-ui, sans-serif"

  const columnId = header.column.id
  // The header line needs room for its label PLUS the sort glyph + gap (~20px);
  // cell values need only their own text. The column fits the widest of the two.
  let max = ctx.measureText(getColumnLabel(header)).width + 20
  for (const row of table.getRowModel().rows) {
    const value = row.getValue(columnId)
    const width = ctx.measureText(value == null ? "" : String(value)).width
    if (width > max) max = width
  }

  // Add the cell's horizontal padding — px-3 on BOTH sides (24) — so the right
  // gap matches the left one (edge → text), not an inflated trailing gap.
  const size = Math.ceil(max) + 24
  const clamped = Math.min(
    header.column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
    Math.max(header.column.columnDef.minSize ?? 0, size),
  )
  table.setColumnSizing((prev) => ({ ...prev, [columnId]: clamped }))
}

/** Drag handle on the trailing edge — drag to resize, double-click to auto-fit
 *  the (left) column to its widest content. */
function DataGridViewColumnResizer<TData, TValue>({
  header,
  table,
}: {
  header: Header<TData, TValue>
  table: Table<TData>
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
      onDoubleClick={() => autoFitColumn(header, table)}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize touch-none bg-transparent transition-colors select-none hover:bg-primary/60",
        "data-[resizing]:bg-primary",
      )}
    />
  )
}
