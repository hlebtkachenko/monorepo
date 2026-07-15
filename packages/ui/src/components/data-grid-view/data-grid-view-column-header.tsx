"use client"

import * as React from "react"
import type {
  Column,
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
  // `disableReorder` (pivot columns) drops the Move items too, not just the drag.
  const canReorder =
    (canSort || canHide) && !pinned && !column.columnDef.meta?.disableReorder

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
                  onSelect={() => {
                    // Cascade to leaves for a GROUP (pivot high-level) column —
                    // TanStack's own toggleVisibility doesn't hide the leaves. A
                    // plain leaf's getLeafColumns() is itself, so this handles both.
                    for (const leaf of column.getLeafColumns())
                      if (leaf.getCanHide()) leaf.toggleVisibility(false)
                  }}
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

/** A column's visible label (`meta.label`, a string header, or the id). */
function getColumnLabelFromColumn<TData>(column: Column<TData>): string {
  const meta = column.columnDef.meta
  if (meta?.label) return meta.label
  const def = column.columnDef.header
  if (typeof def === "string") return def
  return column.id
}

/** Fit ONE leaf column to the widest of its header label and its cell text. */
function fitLeafSize<TData>(
  column: Column<TData>,
  table: Table<TData>,
  ctx: CanvasRenderingContext2D,
  scope: ParentNode,
): number {
  // The header line needs room for its label PLUS the sort glyph + gap (~20px).
  let max = ctx.measureText(getColumnLabelFromColumn(column)).width + 20
  // Measure the RENDERED (formatted) cell text — what the user actually sees, so
  // a currency/number cell fits its "1 500,00 Kč" display, not the raw accessor
  // value. Cells carry their visible column index in `data-col`.
  const colIndex = table
    .getVisibleLeafColumns()
    .findIndex((c) => c.id === column.id)
  if (colIndex >= 0)
    for (const cell of scope.querySelectorAll<HTMLElement>(
      `[data-slot="grid-cell"][data-col="${colIndex}"]`,
    )) {
      const width = ctx.measureText(cell.textContent ?? "").width
      if (width > max) max = width
    }
  // ALSO measure the raw accessor value across ALL rows so off-screen
  // (virtualized) rows still widen the fit.
  for (const row of table.getRowModel().rows) {
    const value = row.getValue(column.id)
    const width = ctx.measureText(value == null ? "" : String(value)).width
    if (width > max) max = width
  }
  // + px-3 padding on both sides (24) + reserved trailing (e.g. the identity
  // column's inspector button) + a few px SLACK (canvas measureText runs a hair
  // narrow vs the live font, so a zero-slack fit clips the last glyph).
  const SLACK = 8
  const trailing = column.columnDef.meta?.trailingWidth ?? 0
  const size = Math.ceil(max) + 24 + trailing + SLACK
  return Math.min(
    column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
    Math.max(column.columnDef.minSize ?? 0, size),
  )
}

/**
 * Auto-fit on a double-click of the divider — Excel's behaviour. Fits EVERY leaf
 * under the double-clicked header: a normal column is its own single leaf; a
 * GROUP header (a pivot high-level column) fits each of its sub-columns to that
 * sub-column's own content, exactly as if each divider were double-clicked. Text
 * is measured off-DOM with a canvas using the grid's computed cell font; no-op
 * without a 2D canvas (jsdom).
 */
function autoFitColumn<TData, TValue>(
  header: Header<TData, TValue>,
  table: Table<TData>,
  /** The resize handle element — used to scope the font sample to THIS grid. */
  resizerEl?: HTMLElement,
): void {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return
  // Sample a cell from the CURRENT grid only, never the first grid-cell on the
  // page (two grids could use different fonts and mis-measure each other).
  const scope: ParentNode =
    resizerEl?.closest('[data-slot="data-grid-view"]') ?? document
  const sampleCell = scope.querySelector<HTMLElement>('[data-slot="grid-cell"]')
  ctx.font = sampleCell
    ? getComputedStyle(sampleCell).font
    : "14px system-ui, sans-serif"

  const sizing: Record<string, number> = {}
  for (const leaf of header.column.getLeafColumns())
    sizing[leaf.id] = fitLeafSize(leaf, table, ctx, scope)
  table.setColumnSizing((prev) => ({ ...prev, ...sizing }))
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
      onDoubleClick={(event) =>
        autoFitColumn(header, table, event.currentTarget)
      }
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize touch-none bg-transparent transition-colors select-none hover:bg-primary/60",
        "data-[resizing]:bg-primary",
      )}
    />
  )
}
