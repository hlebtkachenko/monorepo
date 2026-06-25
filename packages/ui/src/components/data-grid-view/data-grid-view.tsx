"use client"

import * as React from "react"
import {
  flexRender,
  type Cell,
  type Column,
  type Header,
  type Table,
} from "@tanstack/react-table"

import { cn } from "@workspace/ui/lib/utils"

import {
  DataGridViewColumnHeader,
  type ColumnDropTarget,
} from "./data-grid-view-column-header"

/** Sticky positioning for a pinned column (the edge shadow is a separate span). */
function pinStyle<TData>(column: Column<TData>): React.CSSProperties {
  const pinned = column.getIsPinned()
  if (!pinned) return {}
  return {
    position: "sticky",
    left: pinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: pinned === "right" ? `${column.getAfter("right")}px` : undefined,
    zIndex: 2,
  }
}

/** Vertical separator for a cell — same hairline as the row borders. */
function borderClass<TData>(column: Column<TData>): string {
  return column.getIsPinned() === "right"
    ? "border-s border-border-subtle/60"
    : "border-e border-border-subtle/60"
}

/** Whether the grid is scrolled away from each horizontal edge. */
interface ScrollEdges {
  left: boolean
  right: boolean
}

/**
 * The continuous edge shadow for a pinned column. Rendered as one `inset-y-0`
 * gradient span per cell — because the span has sharp top/bottom edges (no
 * blur), the per-cell spans stack into a single smooth strip down the whole
 * column, instead of a scalloped per-row box-shadow.
 *
 * Only shown when there is actually scrolled-under content on that side — a
 * pinned column sitting over empty space (a narrow table, e.g. with the
 * assistant open) draws no phantom shadow.
 */
function PinShadow<TData>({
  column,
  edges,
}: {
  column: Column<TData>
  edges: ScrollEdges
}) {
  const pinned = column.getIsPinned()
  if (pinned === "left" && column.getIsLastColumn("left") && edges.left) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -right-2.5 z-10 w-2.5 bg-gradient-to-r from-black/10 to-transparent dark:from-black/25"
      />
    )
  }
  if (pinned === "right" && column.getIsFirstColumn("right") && edges.right) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-2.5 z-10 w-2.5 bg-gradient-to-l from-black/10 to-transparent dark:from-black/25"
      />
    )
  }
  return null
}

interface DataGridViewProps<TData> extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /**
   * A TanStack table instance (e.g. from `useDataTable`). The grid is purely
   * presentational — every interaction (sort, hide, resize, reorder, pin,
   * select) writes to this table, so a toolbar bound to the SAME instance stays
   * in sync with no extra wiring.
   */
  table: Table<TData>
  /** Message shown when the table has no rows. */
  emptyMessage?: React.ReactNode
  /** Opens a column's filter editor (adds a "Filter" item to each header). */
  onColumnFilter?: (columnId: string) => void
  /** Sends a column to Sidekick (adds an "AI analyze" item to each header). */
  onColumnAnalyze?: (columnId: string) => void
  /** Trailing affordance in the header row after the last column (e.g. "+ Add column"). */
  headerTrailing?: React.ReactNode
}

/**
 * A full-width data grid bound to an external TanStack table. Columns resize by
 * dragging their trailing edge, reorder by dragging the header (a primary line
 * marks where it will land), pin left/right (kept fixed at the body edges with
 * an edge shadow), and sort/filter/hide from the header menu. Cells form a
 * focus grid — click a cell or use the arrow / Home / End / PageUp / PageDown
 * keys to move between them.
 *
 * It renders the columns and rows of whatever `table` it's given (filtering,
 * pagination, selection, and column visibility are owned by that table), so the
 * grid is flush to its container with a tinted, sticky header row and no card.
 */
export function DataGridView<TData>({
  table,
  emptyMessage = "No results.",
  onColumnFilter,
  onColumnAnalyze,
  headerTrailing,
  className,
  ...props
}: DataGridViewProps<TData>) {
  const gridRef = React.useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const leafColumns = table.getVisibleLeafColumns()
  const rowCount = rows.length
  const colCount = leafColumns.length

  const [focused, setFocused] = React.useState<{
    row: number
    col: number
  } | null>(null)
  const [dropTarget, setDropTarget] = React.useState<ColumnDropTarget | null>(
    null,
  )
  // Track whether the grid is scrolled away from each edge so the pinned
  // columns only cast a shadow when they actually overlap scrolled content.
  const [edges, setEdges] = React.useState<ScrollEdges>({
    left: false,
    right: false,
  })

  // Clamp the stored focus on render (rather than in an effect) so a hidden /
  // reordered / paginated table never points at a cell that no longer exists.
  const focusRow =
    focused && rowCount > 0 ? Math.min(focused.row, rowCount - 1) : null
  const focusCol =
    focused && colCount > 0 ? Math.min(focused.col, colCount - 1) : null
  const hasFocus = focusRow !== null && focusCol !== null

  // Move browser focus to the focused cell and reveal it.
  React.useEffect(() => {
    if (focusRow === null || focusCol === null) return
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[data-slot="grid-cell"][data-row="${focusRow}"][data-col="${focusCol}"]`,
    )
    if (!el) return
    if (el !== document.activeElement) el.focus()
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [focusRow, focusCol])

  // CSS-var column sizing: live resize updates these vars without re-rendering
  // every cell. Header cells read `--header-<id>-size`; body cells read
  // `--col-<id>-size`.
  const sizingInfo = table.getState().columnSizingInfo
  const columnSizing = table.getState().columnSizing
  const columnSizeVars = React.useMemo(() => {
    const headers = table.getFlatHeaders()
    const vars: Record<string, string> = {}
    for (const header of headers) {
      vars[`--header-${header.id}-size`] = String(header.getSize())
      vars[`--col-${header.column.id}-size`] = String(header.column.getSize())
    }
    return vars
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizingInfo, columnSizing, leafColumns])

  const moveFocus = React.useCallback(
    (row: number, col: number) => {
      if (rowCount === 0 || colCount === 0) return
      setFocused({
        row: Math.max(0, Math.min(row, rowCount - 1)),
        col: Math.max(0, Math.min(col, colCount - 1)),
      })
    },
    [rowCount, colCount],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rowCount === 0 || colCount === 0) return
      const cur = { row: focusRow ?? 0, col: focusCol ?? 0 }
      const mod = event.ctrlKey || event.metaKey
      switch (event.key) {
        case "ArrowRight":
          moveFocus(cur.row, cur.col + 1)
          break
        case "ArrowLeft":
          moveFocus(cur.row, cur.col - 1)
          break
        case "ArrowDown":
          moveFocus(cur.row + 1, cur.col)
          break
        case "ArrowUp":
          moveFocus(cur.row - 1, cur.col)
          break
        case "Home":
          moveFocus(mod ? 0 : cur.row, 0)
          break
        case "End":
          moveFocus(mod ? rowCount - 1 : cur.row, colCount - 1)
          break
        case "PageDown":
          moveFocus(cur.row + 10, cur.col)
          break
        case "PageUp":
          moveFocus(cur.row - 10, cur.col)
          break
        default:
          return
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [focusRow, focusCol, moveFocus, rowCount, colCount],
  )

  const onGridFocus = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (
        event.target === gridRef.current &&
        !hasFocus &&
        rowCount > 0 &&
        colCount > 0
      ) {
        setFocused({ row: 0, col: 0 })
      }
    },
    [hasFocus, rowCount, colCount],
  )

  // A cell stays focus-ringed until you move off it; clicking outside the grid
  // (empty space, a button, another panel) clears that "selected" state.
  React.useEffect(() => {
    if (!hasFocus) return
    const onPointerDown = (event: PointerEvent) => {
      if (!gridRef.current?.contains(event.target as Node)) setFocused(null)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [hasFocus])

  const totalWidth = table.getTotalSize()

  // Recompute the scrolled-from-edge flags on scroll, resize, and whenever the
  // column footprint changes (resize / pin / hide / the assistant opening).
  const updateEdges = React.useCallback(() => {
    const el = gridRef.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 0,
      right: Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth,
    })
  }, [])

  React.useEffect(() => {
    updateEdges()
  }, [updateEdges, totalWidth, colCount, rowCount])

  React.useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEdges])

  const renderHeaderCell = (header: Header<TData, unknown>) => {
    const interactive = header.column.getCanSort() || header.column.getCanHide()
    const align = header.column.columnDef.meta?.align
    return (
      <div
        key={header.id}
        role="columnheader"
        data-slot="grid-header-cell"
        className={cn(
          "relative flex h-9 shrink-0 items-center bg-muted text-muted-foreground",
          borderClass(header.column),
        )}
        style={{
          ...pinStyle(header.column),
          width: `calc(var(--header-${header.id}-size) * 1px)`,
        }}
      >
        {header.isPlaceholder ? null : interactive ? (
          <DataGridViewColumnHeader
            header={header}
            table={table}
            onColumnFilter={onColumnFilter}
            onColumnAnalyze={onColumnAnalyze}
            onDropTargetChange={setDropTarget}
          />
        ) : (
          <div
            className={cn(
              "flex size-full items-center",
              align === "center" ? "justify-center px-0" : "px-3",
            )}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        )}
        <PinShadow column={header.column} edges={edges} />
        {dropTarget?.columnId === header.column.id ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-primary",
              dropTarget.side === "before" ? "left-0" : "right-0",
            )}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Data grid"
      aria-rowcount={rowCount + 1}
      aria-colcount={colCount}
      data-slot="data-grid-view"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={onGridFocus}
      onScroll={updateEdges}
      className={cn(
        "relative w-full overflow-auto bg-background outline-none",
        className,
      )}
      style={columnSizeVars}
      {...props}
    >
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div
          role="rowgroup"
          data-slot="grid-header"
          className="sticky top-0 z-10 border-b border-border-subtle bg-muted"
        >
          {table.getHeaderGroups().map((headerGroup) => {
            const left = headerGroup.headers.filter(
              (h) => h.column.getIsPinned() === "left",
            )
            const center = headerGroup.headers.filter(
              (h) => !h.column.getIsPinned(),
            )
            const right = headerGroup.headers.filter(
              (h) => h.column.getIsPinned() === "right",
            )
            return (
              <div
                key={headerGroup.id}
                role="row"
                data-slot="grid-header-row"
                className="flex w-full"
              >
                {left.map(renderHeaderCell)}
                {center.map(renderHeaderCell)}
                <div
                  data-slot="grid-header-spacer"
                  className="flex flex-1 items-center bg-muted"
                >
                  {headerTrailing}
                </div>
                {right.map(renderHeaderCell)}
              </div>
            )
          })}
        </div>
        <div role="rowgroup" data-slot="grid-body">
          {rowCount === 0 ? (
            <div role="row" className="flex w-full">
              <div
                role="gridcell"
                className="flex h-24 w-full items-center justify-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </div>
            </div>
          ) : (
            rows.map((row, rowIndex) => {
              const selected = row.getIsSelected()
              const cells = row.getVisibleCells()
              const left = cells.filter(
                (c) => c.column.getIsPinned() === "left",
              )
              const center = cells.filter((c) => !c.column.getIsPinned())
              const right = cells.filter(
                (c) => c.column.getIsPinned() === "right",
              )
              const renderCell = (cell: Cell<TData, unknown>) => (
                <DataGridViewCell
                  key={cell.id}
                  cell={cell}
                  rowIndex={rowIndex}
                  colIndex={cells.indexOf(cell)}
                  selected={selected}
                  edges={edges}
                  isFocused={
                    hasFocus &&
                    focusRow === rowIndex &&
                    focusCol === cells.indexOf(cell)
                  }
                  onFocusCell={() =>
                    setFocused({ row: rowIndex, col: cells.indexOf(cell) })
                  }
                />
              )
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-selected={selected}
                  data-state={selected ? "selected" : undefined}
                  data-slot="grid-row"
                  className={cn(
                    "flex w-full border-b border-border-subtle/60",
                    selected ? "bg-muted/50" : "hover:bg-muted/30",
                  )}
                >
                  {left.map(renderCell)}
                  {center.map(renderCell)}
                  <div data-slot="grid-row-spacer" className="flex-1" />
                  {right.map(renderCell)}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

interface DataGridViewCellProps<TData> {
  cell: Cell<TData, unknown>
  rowIndex: number
  colIndex: number
  selected: boolean
  edges: ScrollEdges
  isFocused: boolean
  onFocusCell: () => void
}

function DataGridViewCell<TData>({
  cell,
  rowIndex,
  colIndex,
  selected,
  edges,
  isFocused,
  onFocusCell,
}: DataGridViewCellProps<TData>) {
  const pinned = cell.column.getIsPinned()
  const align = cell.column.columnDef.meta?.align
  const centered = align === "center"
  return (
    <div
      role="gridcell"
      data-slot="grid-cell"
      data-row={rowIndex}
      data-col={colIndex}
      data-pinned={pinned || undefined}
      tabIndex={isFocused ? 0 : -1}
      onMouseDown={onFocusCell}
      className={cn(
        "flex h-8 shrink-0 items-center text-sm outline-none",
        centered ? "justify-center px-0" : "px-3",
        borderClass(cell.column),
        // Pinned cells need an opaque background so scrolled content can't show
        // through; match the row's tint so selection still reads.
        pinned ? (selected ? "bg-muted" : "bg-background") : undefined,
        isFocused && "ring-1 ring-ring ring-inset",
      )}
      style={{
        ...pinStyle(cell.column),
        width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
      }}
    >
      {centered ? (
        flexRender(cell.column.columnDef.cell, cell.getContext())
      ) : (
        <div className="w-full min-w-0 truncate">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      )}
      <PinShadow column={cell.column} edges={edges} />
    </div>
  )
}
