"use client"

import * as React from "react"
import {
  flexRender,
  type Cell,
  type Header,
  type Table,
} from "@tanstack/react-table"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"

import { cn } from "@workspace/ui/lib/utils"

import {
  DataGridViewColumnHeader,
  commitCenter,
  commitPinnedGroup,
  getCenterIds,
} from "./data-grid-view-column-header"
import { SortableHeaderCell } from "./data-grid-view-sortable-header"
import {
  PinShadow,
  borderClass,
  pinStyle,
  type ScrollEdges,
} from "./data-grid-view-pin"

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
  const [activeColumnId, setActiveColumnId] = React.useState<string | null>(
    null,
  )

  // Pointer covers mouse + touch; the 8px activation distance lets a stationary
  // click still reach the header menu / grip without starting a drag. Keyboard
  // sensor makes the grip button drag with Space + arrows.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onColumnDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveColumnId(String(event.active.id))
  }, [])

  const onColumnDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActiveColumnId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return
      const activeId = String(active.id)
      const overId = String(over.id)
      // Reorder WITHIN a group only — each group is its own SortableContext, so
      // `over` is always a sibling of `active`. Centre writes `columnOrder`
      // (shared with the Columns manager); a pinned column writes its
      // `columnPinning` slice (left/right), which the section's pin invariant
      // then re-anchors (select first, actions last).
      const pinned = table.getColumn(activeId)?.getIsPinned()
      if (pinned === "left" || pinned === "right") {
        const group = (table.getState().columnPinning[pinned] ?? []).slice()
        const from = group.indexOf(activeId)
        const to = group.indexOf(overId)
        if (from < 0 || to < 0) return
        commitPinnedGroup(table, pinned, arrayMove(group, from, to))
        return
      }
      const center = getCenterIds(table)
      const from = center.indexOf(activeId)
      const to = center.indexOf(overId)
      if (from < 0 || to < 0) return
      commitCenter(table, arrayMove(center, from, to))
    },
    [table],
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

  // One group (left-pinned / centre / right-pinned) as its own SortableContext,
  // so a header only reorders among its siblings — a pinned column drags within
  // the pinned area, a centre column within the centre, never across.
  const renderHeaderGroup = (headers: Header<TData, unknown>[]) => (
    <SortableContext
      items={headers.map((h) => h.column.id)}
      strategy={horizontalListSortingStrategy}
    >
      {headers.map((header) => (
        <SortableHeaderCell
          key={header.id}
          header={header}
          table={table}
          edges={edges}
          onColumnFilter={onColumnFilter}
          onColumnAnalyze={onColumnAnalyze}
        />
      ))}
    </SortableContext>
  )

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
      {/* The rowgroups are DIRECT children of role="grid" (axe
          aria-required-children needs that) and each carries the scroll width,
          so no intermediate wrapper sits between the grid and its rows.
          dnd-kit's screen-reader elements (a role="status" live region + hidden
          instructions) are portaled to <body> instead of rendering inline as
          disallowed grid children. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragStart={onColumnDragStart}
        onDragEnd={onColumnDragEnd}
        onDragCancel={() => setActiveColumnId(null)}
        accessibility={{
          container:
            typeof document !== "undefined" ? document.body : undefined,
        }}
      >
        <div
          role="rowgroup"
          data-slot="grid-header"
          className="sticky top-0 z-10 border-b border-border-subtle bg-muted"
          style={{ width: totalWidth, minWidth: "100%" }}
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
                {renderHeaderGroup(left)}
                {renderHeaderGroup(center)}
                <div
                  data-slot="grid-header-spacer"
                  className="flex flex-1 items-center bg-muted"
                >
                  {headerTrailing}
                </div>
                {renderHeaderGroup(right)}
              </div>
            )
          })}
        </div>
        <DragOverlay modifiers={[restrictToHorizontalAxis]}>
          {activeColumnId ? (
            <div className="flex h-9 items-center border bg-muted px-3 text-sm font-medium text-foreground shadow">
              {String(
                table.getColumn(activeColumnId)?.columnDef.meta?.label ??
                  activeColumnId,
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div
        role="rowgroup"
        data-slot="grid-body"
        style={{ width: totalWidth, minWidth: "100%" }}
      >
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
            const left = cells.filter((c) => c.column.getIsPinned() === "left")
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
                  "group/row flex w-full border-b border-border-subtle/60",
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
