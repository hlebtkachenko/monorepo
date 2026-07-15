"use client"

import * as React from "react"
import {
  flexRender,
  type Cell,
  type Column,
  type Header,
  type Row,
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
import { useVirtualizer } from "@tanstack/react-virtual"

import { GripVertical } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Above this many rows the body switches to windowed (virtualized) rendering so
 * a 1000+ row table stays smooth. Below it, every row renders in normal flow —
 * which keeps small tables (and the jsdom tests, where there is no layout for a
 * virtualizer to measure) on the exact path they had before.
 */
const VIRTUALIZE_THRESHOLD = 100
/** Row pitch estimate: cells are `h-8` (32px) + the row's 1px bottom hairline,
 * so a rendered row's box is 33px. Only seeds unmeasured rows — the virtualizer
 * re-measures each mounted row via `measureElement`. */
const ESTIMATED_ROW_HEIGHT = 33

/**
 * True when a keyboard event originates inside a control that owns its own key
 * handling — a text/number input, textarea, native/Radix select or combobox, or
 * a contenteditable element. The grid's arrow/Home/End/Page navigation must
 * defer to these so the caret / option list moves instead of the grid focus.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  const role = target.getAttribute("role")
  return role === "textbox" || role === "combobox" || role === "listbox"
}

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
  groupEdgeIds,
  pinStyle,
  type ScrollEdges,
} from "./data-grid-view-pin"
import { getColumnLabel } from "../data-table/data-table-utils"

/**
 * A pinned summary (grand-total / footer) row, rendered in its OWN sticky-bottom
 * rowgroup OUTSIDE the table's sortable / filterable / selectable / expandable
 * row model. It reuses the grid's live column tracks (widths + left/right pinning)
 * so it lines up with the body, but the caller pre-renders each cell's content —
 * the grid never treats the total as a real data row, so it can never be sorted,
 * filtered, searched, selected, or expanded, and it always stays visible and
 * last. Omit it (or pass `null`) to render no footer.
 */
export interface DataGridSummaryRow {
  /** Cell content keyed by column id; a column with no entry renders empty. */
  cells: Record<string, React.ReactNode>
  /** Accessible name for the summary row (e.g. "Grand total"). */
  ariaLabel?: string
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
  /** Double-click a row to activate it (e.g. open the row Inspector). */
  onRowActivate?: (row: Row<TData>) => void
  /**
   * A pinned grand-total / footer row rendered outside the body row model (see
   * {@link DataGridSummaryRow}). Stays last + visible under any sort/filter and is
   * never a selectable/searchable data row.
   */
  summaryRow?: DataGridSummaryRow | null
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
  onRowActivate,
  summaryRow,
  className,
  ...props
}: DataGridViewProps<TData>) {
  const gridRef = React.useRef<HTMLDivElement>(null)
  // dnd-kit derives its accessibility ids (aria-describedby "DndDescribedBy-N")
  // from a MODULE-LEVEL counter when no id is given — that counter differs
  // between the SSR render and the client hydration, so the grip buttons
  // mismatch and React logs a hydration error. A React SSR-stable useId as the
  // DndContext id makes those ids deterministic.
  const dndContextId = React.useId()
  const rows = table.getRowModel().rows
  const leafColumns = table.getVisibleLeafColumns()
  const rowCount = rows.length
  const colCount = leafColumns.length
  // Leaf + group-header ids sitting on a high-level pivot group's right edge, so
  // that boundary draws a full-strength divider cascading down the body. Empty
  // for a flat table (no column groups); a cheap pass over the visible leaves.
  const groupEdges = groupEdgeIds(table)
  // The first column keyboard cell-focus may land on — skips columns that opt
  // out via `meta.focusable: false` (the select column). Those are edge
  // structural columns, so a lower-bound clamp is enough to skip them.
  const firstFocusableCol = Math.max(
    0,
    leafColumns.findIndex((c) => c.columnDef.meta?.focusable !== false),
  )

  // Windowed body rendering for large tables (single-page, no pagination). The
  // grid container itself is the scroll element; rows are fixed-height, measured
  // on mount so the border hairline is accounted for exactly.
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => gridRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => rows[index]?.id ?? index,
  })
  const virtualize = rowCount > VIRTUALIZE_THRESHOLD

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
    focused && colCount > 0
      ? Math.max(firstFocusableCol, Math.min(focused.col, colCount - 1))
      : null
  const hasFocus = focusRow !== null && focusCol !== null

  // Move browser focus to the focused cell and reveal it.
  React.useEffect(() => {
    if (focusRow === null || focusCol === null) return
    // When virtualized, the target row may not be mounted — scroll it into the
    // window first, then focus once it renders (rAF), else focus synchronously.
    if (virtualize) rowVirtualizer.scrollToIndex(focusRow, { align: "auto" })
    const focusCell = () => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-slot="grid-cell"][data-row="${focusRow}"][data-col="${focusCol}"]`,
      )
      if (!el) return false
      if (el !== document.activeElement) el.focus()
      el.scrollIntoView({ block: "nearest", inline: "nearest" })
      return true
    }
    if (focusCell()) return
    const raf = requestAnimationFrame(() => focusCell())
    return () => cancelAnimationFrame(raf)
  }, [focusRow, focusCol, virtualize, rowVirtualizer])

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
        col: Math.max(firstFocusableCol, Math.min(col, colCount - 1)),
      })
    },
    [rowCount, colCount, firstFocusableCol],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rowCount === 0 || colCount === 0) return
      // Keys bubbling up from an active editor (text/number input, Select, or any
      // contenteditable) belong to that control — arrow/Home/End move its caret
      // or its option list, NOT the grid focus. Only drive navigation when the
      // event originates on the grid itself or a non-editor cell.
      if (isTextEntryTarget(event.target)) return
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
          moveFocus(mod ? 0 : cur.row, firstFocusableCol)
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

  // Auto-selecting cell 0 when the grid receives focus is for KEYBOARD entry
  // (Tab into the grid) only. A pointer press that lands on empty grid space
  // also focuses the grid div — without this guard it would wrongly select the
  // first cell right after a click-away. `onPointerDown` flags the pointer path;
  // a rAF clears it so a later Tab still auto-selects.
  const pointerFocusRef = React.useRef(false)
  const markPointerFocus = React.useCallback(() => {
    pointerFocusRef.current = true
    requestAnimationFrame(() => {
      pointerFocusRef.current = false
    })
  }, [])
  const onGridFocus = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (pointerFocusRef.current) return
      if (
        event.target === gridRef.current &&
        !hasFocus &&
        rowCount > 0 &&
        colCount > 0
      ) {
        setFocused({ row: 0, col: firstFocusableCol })
      }
    },
    [hasFocus, rowCount, colCount, firstFocusableCol],
  )

  // A cell stays focus-ringed until you click OFF it — anywhere that is not a
  // grid cell (the header, empty body space, another panel, outside the grid)
  // clears the selection. Clicking another cell keeps focus because that cell's
  // own `onMouseDown` re-sets it after this runs.
  React.useEffect(() => {
    if (!hasFocus) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-slot="grid-cell"]')) setFocused(null)
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
  const renderHeaderGroup = (headers: Header<TData, unknown>[]) => {
    // Scope each SortableContext to ONE parent group, so a drag reorders only
    // among siblings WITHIN that group — a pivot value column can't be dragged
    // out of its high-level header. A flat table's columns all share the root
    // parent → a single context (unchanged). Runs of same-parent headers are
    // already contiguous (visual order), so a linear pass groups them.
    const runs: { headers: Header<TData, unknown>[] }[] = []
    for (const header of headers) {
      const key = header.column.parent?.id ?? "__root"
      const last = runs[runs.length - 1]
      if (last && (last.headers[0]?.column.parent?.id ?? "__root") === key)
        last.headers.push(header)
      else runs.push({ headers: [header] })
    }
    return runs.map((run) => (
      <SortableContext
        key={run.headers[0]!.id}
        items={run.headers.map((h) => h.column.id)}
        strategy={horizontalListSortingStrategy}
      >
        {run.headers.map((header) => (
          <SortableHeaderCell
            key={header.id}
            header={header}
            table={table}
            edges={edges}
            groupEdge={groupEdges.has(header.column.id)}
            onColumnFilter={onColumnFilter}
            onColumnAnalyze={onColumnAnalyze}
          />
        ))}
      </SortableContext>
    ))
  }

  // One body row — shared by the normal and virtualized branches. `extra` carries
  // the absolute-position style + `measureElement` ref + `data-index` the
  // virtualizer needs; it is absent (and inert) in the normal path.
  const renderRow = (
    row: Row<TData>,
    rowIndex: number,
    extra?: {
      style?: React.CSSProperties
      ref?: (el: HTMLDivElement | null) => void
      dataIndex?: number
    },
  ) => {
    const selected = row.getIsSelected()
    const cells = row.getVisibleCells()
    const left = cells.filter((c) => c.column.getIsPinned() === "left")
    const center = cells.filter((c) => !c.column.getIsPinned())
    const right = cells.filter((c) => c.column.getIsPinned() === "right")
    const renderCell = (cell: Cell<TData, unknown>) => (
      <DataGridViewCell
        key={cell.id}
        cell={cell}
        rowIndex={rowIndex}
        colIndex={cells.indexOf(cell)}
        selected={selected}
        edges={edges}
        groupEdge={groupEdges.has(cell.column.id)}
        isFocused={
          hasFocus && focusRow === rowIndex && focusCol === cells.indexOf(cell)
        }
        onFocusCell={() =>
          setFocused({ row: rowIndex, col: cells.indexOf(cell) })
        }
      />
    )
    return (
      <div
        key={row.id}
        ref={extra?.ref}
        data-index={extra?.dataIndex}
        role="row"
        aria-selected={selected}
        aria-rowindex={rowIndex + 2}
        aria-expanded={row.getCanExpand() ? row.getIsExpanded() : undefined}
        data-state={selected ? "selected" : undefined}
        data-slot="grid-row"
        onDoubleClick={onRowActivate ? () => onRowActivate(row) : undefined}
        className={cn(
          "group/row flex w-full border-b border-border-subtle/60",
          selected
            ? "bg-grid-row-selected"
            : "bg-grid-row hover:bg-grid-row-hover",
          // Lift the row holding the focused cell above its siblings so the
          // cell's outset focus ring isn't painted over by the next row (a
          // per-cell z-index can't escape its own row's stacking context).
          focusRow === rowIndex && "relative z-20",
        )}
        style={extra?.style}
      >
        {left.map(renderCell)}
        {center.map(renderCell)}
        <div data-slot="grid-row-spacer" className="flex-1" />
        {right.map(renderCell)}
      </div>
    )
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Data grid"
      // Header row + every body row (virtualized or not) + the summary row when present.
      aria-rowcount={rowCount + 1 + (summaryRow ? 1 : 0)}
      aria-colcount={colCount}
      data-slot="data-grid-view"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={onGridFocus}
      onPointerDown={markPointerFocus}
      onScroll={updateEdges}
      className={cn(
        // `antialiased` (grayscale smoothing) — MATCH the app-wide setting on
        // <html> (layout.tsx). On real macOS Chrome, subpixel/LCD text (`auto`)
        // on a dark surface renders colored fringes that read as an "outline";
        // grayscale renders clean, exactly like every other app surface. Verified
        // clean in Chromium via Playwright — the fringe is macOS-Chrome-only.
        "relative w-full overflow-auto bg-background antialiased outline-none",
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
        id={dndContextId}
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
          // `z-30` sits above the focused row (`z-20`) and focused cell (`z-10`)
          // so a focused/selected body row can never paint over the sticky
          // header when the grid is scrolled vertically.
          className="sticky top-0 z-30 border-b border-border-subtle bg-grid-header"
          style={{ width: totalWidth, minWidth: "100%" }}
        >
          {table.getHeaderGroups().map((headerGroup, rowIndex, groups) => {
            const left = headerGroup.headers.filter(
              (h) => h.column.getIsPinned() === "left",
            )
            const center = headerGroup.headers.filter(
              (h) => !h.column.getIsPinned(),
            )
            const right = headerGroup.headers.filter(
              (h) => h.column.getIsPinned() === "right",
            )
            // With hierarchical (grouped) columns, `getHeaderGroups()` yields one
            // row per header tier; every tier renders on the SAME neutral header
            // surface (a group tier is an ordinary header row that merely spans
            // its children — no separate tint).
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
                  className="flex flex-1 items-center bg-grid-header"
                >
                  {rowIndex === groups.length - 1 ? headerTrailing : null}
                </div>
                {renderHeaderGroup(right)}
              </div>
            )
          })}
        </div>
        <DragOverlay modifiers={[restrictToHorizontalAxis]}>
          {activeColumnId ? (
            <div className="flex h-9 cursor-grabbing items-center gap-1 border bg-grid-header-hover pr-3 pl-1 text-sm font-medium text-foreground shadow">
              <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
              {getColumnLabel(table.getColumn(activeColumnId))}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div
        role="rowgroup"
        data-slot="grid-body"
        style={{
          width: totalWidth,
          minWidth: "100%",
          // Virtualized: the rowgroup owns the full scroll height and its rows
          // are absolutely positioned into the window. Rows stay DIRECT children
          // of the rowgroup (no wrapper) so the grid a11y tree is unchanged.
          ...(virtualize && rowCount > 0
            ? {
                height: rowVirtualizer.getTotalSize(),
                position: "relative" as const,
              }
            : {}),
        }}
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
        ) : virtualize ? (
          rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            return renderRow(row, virtualRow.index, {
              ref: rowVirtualizer.measureElement,
              dataIndex: virtualRow.index,
              // Position with `top`, NOT `transform: translateY` — a transform
              // promotes the row to its own composited layer, which disables LCD
              // subpixel text and brings back the dark-mode "outline" halo. Plain
              // absolute + top keeps the row on the crisp subpixel path.
              style: {
                position: "absolute",
                top: virtualRow.start,
                left: 0,
                width: "100%",
              },
            })
          })
        ) : (
          rows.map((row, rowIndex) => renderRow(row, rowIndex))
        )}
      </div>
      {summaryRow ? (
        <div
          role="rowgroup"
          data-slot="grid-footer"
          // A sticky-bottom footer (mirrors the sticky-top header) that stays
          // visible + last. `z-30` sits above the body focus/selection layers.
          // A DIRECT child of role="grid" (a11y aria-required-children) — its one
          // row is separate from the body row model, so no sort/filter reaches it.
          // `-mt-px` pulls the opaque footer up 1px so it swallows the last body
          // row's faint `/60` border-b; the footer's own 2px full-weight seam is
          // then the ONLY divider (no mismatched double line), matching the pin
          // seam weight + colour.
          className="sticky bottom-0 z-30 -mt-px border-t-2 border-border-subtle bg-grid-header"
          style={{ width: totalWidth, minWidth: "100%" }}
        >
          <div
            role="row"
            data-slot="grid-summary-row"
            aria-rowindex={rowCount + 2}
            aria-label={summaryRow.ariaLabel}
            className="flex w-full"
          >
            {leafColumns
              .filter((c) => c.getIsPinned() === "left")
              .map((column) => (
                <DataGridViewSummaryCell
                  key={column.id}
                  column={column}
                  content={summaryRow.cells[column.id]}
                  edges={edges}
                  groupEdge={groupEdges.has(column.id)}
                />
              ))}
            {leafColumns
              .filter((c) => !c.getIsPinned())
              .map((column) => (
                <DataGridViewSummaryCell
                  key={column.id}
                  column={column}
                  content={summaryRow.cells[column.id]}
                  edges={edges}
                  groupEdge={groupEdges.has(column.id)}
                />
              ))}
            <div
              data-slot="grid-summary-spacer"
              className="flex-1 bg-grid-header"
            />
            {leafColumns
              .filter((c) => c.getIsPinned() === "right")
              .map((column) => (
                <DataGridViewSummaryCell
                  key={column.id}
                  column={column}
                  content={summaryRow.cells[column.id]}
                  edges={edges}
                  groupEdge={groupEdges.has(column.id)}
                />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface DataGridViewCellProps<TData> {
  cell: Cell<TData, unknown>
  rowIndex: number
  colIndex: number
  selected: boolean
  edges: ScrollEdges
  /** This cell sits on a high-level pivot group's right edge → full divider. */
  groupEdge: boolean
  isFocused: boolean
  onFocusCell: () => void
}

function DataGridViewCell<TData>({
  cell,
  rowIndex,
  colIndex,
  selected,
  edges,
  groupEdge,
  isFocused,
  onFocusCell,
}: DataGridViewCellProps<TData>) {
  const pinned = cell.column.getIsPinned()
  const align = cell.column.columnDef.meta?.align
  const centered = align === "center"
  // The select column opts out of cell focus (spec §9): no tabIndex, no focus
  // ring, no click-to-focus — arrow-nav skips it too (see firstFocusableCol).
  const focusable = cell.column.columnDef.meta?.focusable !== false
  const editable = cell.column.columnDef.meta?.editable === true
  const active = focusable && isFocused
  return (
    <div
      role="gridcell"
      data-slot="grid-cell"
      data-row={rowIndex}
      data-col={colIndex}
      data-pinned={pinned || undefined}
      tabIndex={active ? 0 : -1}
      onMouseDown={focusable ? onFocusCell : undefined}
      className={cn(
        "flex h-8 shrink-0 items-center text-sm outline-none",
        centered ? "justify-center px-0" : "px-3",
        borderClass(cell.column, groupEdge),
        // Pinned cells need an opaque background so scrolled content can't show
        // through; match the row's surface (idle/hover/selected) so selection +
        // hover still read on the frozen columns.
        pinned
          ? selected
            ? "bg-grid-row-selected"
            : "bg-grid-row group-hover/row:bg-grid-row-hover"
          : undefined,
        // Focus ring: an OUTSET ring (not inset) lifted above the neighbours so
        // it sits ON TOP of the cell dividers rather than inside the cell.
        active && "relative z-10 ring-2 ring-ring",
        // A focused editable cell gets a white field surface.
        active && editable && "bg-background",
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

/**
 * One cell of the pinned summary (grand-total) row. Non-interactive — no focus
 * ring, no editing, not part of the focus grid — but it reuses the SAME column
 * tracks (width CSS var, left/right pin sticky offset, edge shadow, divider) as a
 * body cell so the total lines up under its column. Content is pre-rendered by the
 * caller (already formatted); a column with no summary entry renders empty.
 */
function DataGridViewSummaryCell<TData>({
  column,
  content,
  edges,
  groupEdge,
}: {
  column: Column<TData, unknown>
  content: React.ReactNode
  edges: ScrollEdges
  /** This cell sits on a high-level pivot group's right edge → full divider. */
  groupEdge: boolean
}) {
  const pinned = column.getIsPinned()
  const centered = column.columnDef.meta?.align === "center"
  return (
    <div
      role="gridcell"
      data-slot="grid-summary-cell"
      className={cn(
        // Opaque footer surface so a pinned summary cell can't show scrolled
        // content through it (same reason the header/pinned body cells are opaque).
        "flex h-8 shrink-0 items-center bg-grid-header text-sm",
        centered ? "justify-center px-0" : "px-3",
        borderClass(column, groupEdge),
      )}
      style={{
        ...pinStyle(column),
        width: `calc(var(--col-${column.id}-size) * 1px)`,
      }}
    >
      {centered ? (
        content
      ) : (
        <div className="w-full min-w-0 truncate">{content}</div>
      )}
      <PinShadow column={column} edges={edges} />
    </div>
  )
}
