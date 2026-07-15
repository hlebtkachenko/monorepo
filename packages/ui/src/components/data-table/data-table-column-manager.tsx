"use client"

import type { Column, Table } from "@tanstack/react-table"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import {
  CheckIcon,
  Columns3,
  GripVertical,
  RotateCcw,
} from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { getColumnLabel } from "./data-table-utils"

/**
 * Move `sourceId` before/after `targetId` within the non-pinned centre group,
 * leaving the left/right pinned groups in place. Operates on the table's
 * `columnOrder` (seeding it from the leaf order when empty).
 */
function reorderColumn<TData>(
  table: Table<TData>,
  sourceId: string,
  targetId: string,
  edge: "top" | "bottom",
) {
  if (sourceId === targetId) return
  const order = table.getState().columnOrder.length
    ? table.getState().columnOrder
    : table.getAllLeafColumns().map((c) => c.id)
  const center = order.filter((id) => !table.getColumn(id)?.getIsPinned())
  const from = center.indexOf(sourceId)
  if (from < 0) return
  const next = [...center]
  const [moved] = next.splice(from, 1)
  if (moved == null) return
  const to = next.indexOf(targetId)
  if (to < 0) return
  next.splice(edge === "top" ? to : to + 1, 0, moved)
  const left = order.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "left",
  )
  const right = order.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "right",
  )
  table.setColumnOrder([...left, ...next, ...right])
}

/**
 * The column manager body — pinned + unpinned sections (divider between), each
 * row a grey grip handle (drag to reorder), a black column label, and a
 * right-edge Checkbox that toggles visibility. Unpinned rows reorder via drag
 * (writing the table's `columnOrder`); pinned rows stay in their pinned area
 * (grip is decorative there). Generic over any TanStack `Table<TData>` — reads
 * only `getCanHide` / `getIsVisible` / `getIsPinned` / column order.
 *
 * Render it inside any surface — the toolbar "Columns" popover (see
 * `DataTableColumnManager`) or a grid's "+ Add column" trigger.
 */
/**
 * Toggle a column's visibility. For a GROUP column (a pivot high-level header
 * that spans several value columns) TanStack's own `toggleVisibility` does NOT
 * cascade — hiding the group id leaves the leaves visible. So cascade to the
 * group's leaf columns; a plain leaf's `getLeafColumns()` is just itself, so the
 * same call handles both.
 */
function setColumnVisibility<TData>(
  column: Column<TData>,
  visible: boolean,
): void {
  const leaves = column.getLeafColumns()
  const isGroup = !(leaves.length === 1 && leaves[0]?.id === column.id)
  if (!isGroup) {
    column.toggleVisibility(visible)
    return
  }
  for (const leaf of leaves)
    if (leaf.getCanHide()) leaf.toggleVisibility(visible)
}

export function ColumnManagerMenuContent<TData>({
  table,
}: {
  table: Table<TData>
}) {
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    id: string
    edge: "top" | "bottom"
  } | null>(null)

  // Pinned groups render in TanStack's own pinning order (`columnPinning.left`
  // / `.right`) — dragging a pinned header writes those arrays, not
  // `columnOrder`, so the manager must read the same source to stay in sync.
  // The unpinned centre group still follows `columnOrder`, falling back to
  // definition order (via the stable sort) for ids it doesn't mention.
  const { left: pinnedLeftIds = [], right: pinnedRightIds = [] } =
    table.getState().columnPinning
  const orderIds = table.getState().columnOrder
  const orderIndex = (id: string) => {
    const index = orderIds.indexOf(id)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  const columnById = new Map(columns.map((column) => [column.id, column]))

  const pinnedLeft = pinnedLeftIds
    .map((id) => columnById.get(id))
    .filter((column): column is NonNullable<typeof column> => column != null)
  const pinnedRight = pinnedRightIds
    .map((id) => columnById.get(id))
    .filter((column): column is NonNullable<typeof column> => column != null)
  const pinnedIds = new Set([...pinnedLeftIds, ...pinnedRightIds])
  const unpinned = columns
    .filter((column) => !pinnedIds.has(column.id))
    .sort((a, b) => orderIndex(a.id) - orderIndex(b.id))

  const renderRow = (column: (typeof columns)[number], draggable: boolean) => {
    const visible = column.getIsVisible()
    const label = getColumnLabel(column)
    const over = dropTarget?.id === column.id
    return (
      <div key={column.id} className="relative">
        {over && dropTarget.edge === "top" ? (
          <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
        {/* The whole row is one toggle target (like a menu checkbox item); the
            grip is the only drag handle so a click anywhere else flips
            visibility. Checkbox is a trailing state indicator, not its own hit
            target. */}
        <div
          onDragOver={(event) => {
            if (!dragId || dragId === column.id || !draggable) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = "move"
            const rect = event.currentTarget.getBoundingClientRect()
            const edge =
              event.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
            setDropTarget({ id: column.id, edge })
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (dragId) {
              reorderColumn(table, dragId, column.id, dropTarget?.edge ?? "top")
            }
            setDragId(null)
            setDropTarget(null)
          }}
          className={cn(
            "group/col flex items-center rounded-sm hover:bg-accent",
            dragId === column.id && "opacity-40",
          )}
        >
          <span
            draggable={draggable}
            onDragStart={
              draggable
                ? (event) => {
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", column.id)
                    setDragId(column.id)
                  }
                : undefined
            }
            onDragEnd={() => {
              setDragId(null)
              setDropTarget(null)
            }}
            className={cn(
              "flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground",
              draggable ? "cursor-grab active:cursor-grabbing" : "opacity-40",
            )}
          >
            <GripVertical className="size-4" />
          </span>
          {/* role="button" on a div, NOT a real <button>: the trailing Checkbox
              is a Radix <button role="checkbox"> and a button can't nest a
              button (invalid HTML + hydration error). The checkbox is a
              decorative, aria-hidden state indicator; the row div owns the
              toggle semantics (aria-pressed) + keyboard. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setColumnVisibility(column, !visible)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                setColumnVisibility(column, !visible)
              }
            }}
            aria-label={visible ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={visible}
            className="flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-sm pr-2.5 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="flex-1 truncate text-foreground">{label}</span>
            {/* Non-interactive state indicator mirroring the Checkbox look — a
                real <Checkbox> is a <button role="checkbox">, which axe flags as
                nested-interactive inside the row's role="button". */}
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                visible
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {visible ? <CheckIcon className="size-3.5" /> : null}
            </span>
          </div>
        </div>
        {over && dropTarget.edge === "bottom" ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
      </div>
    )
  }

  const sectionLabel = (text: string) => (
    <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
      {text}
    </div>
  )

  return (
    <>
      {pinnedLeft.length > 0 ? (
        <>
          {sectionLabel("Pinned left")}
          {pinnedLeft.map((column) => renderRow(column, false))}
        </>
      ) : null}
      {pinnedRight.length > 0 ? (
        <>
          {pinnedLeft.length > 0 ? <Separator className="my-1" /> : null}
          {sectionLabel("Pinned right")}
          {pinnedRight.map((column) => renderRow(column, false))}
        </>
      ) : null}
      {unpinned.length > 0 ? (
        <>
          {pinnedLeft.length > 0 || pinnedRight.length > 0 ? (
            <Separator className="my-1" />
          ) : null}
          {sectionLabel("Unpinned")}
          {unpinned.map((column) => renderRow(column, true))}
        </>
      ) : null}
      {/* Pinned to the bottom of the (scrolling) popover: reset the whole column
          layout — widths, order, AND pinning — back to the section defaults.
          `resetColumnSizing(true)` clears widths so `getSize()` falls back to each
          def `size`; `resetColumnOrder(true)` clears the custom order (definition
          order returns); `resetColumnPinning()` restores `initialState` pinning
          (the structural select-left / actions-right anchors). The layout
          persistence then rewrites the reset state on the next change. */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-1 border-t bg-popover px-1 pt-1">
        <button
          type="button"
          onClick={() => {
            table.resetColumnSizing(true)
            table.resetColumnOrder(true)
            table.resetColumnPinning()
          }}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
        >
          <RotateCcw className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">Reset column layout</span>
        </button>
      </div>
    </>
  )
}

/**
 * Ready-made toolbar control: an outline "Columns" button opening a Popover with
 * the `ColumnManagerMenuContent` list. A Popover (not a menu) so the checkboxes
 * and drag handles behave as normal interactive content.
 */
export function DataTableColumnManager<TData>({
  table,
  label = "Columns",
  triggerSize = "sm",
  disabled = false,
}: {
  table: Table<TData>
  label?: string
  /** Trigger button size — defaults to `sm` for legacy toolbars. */
  triggerSize?: React.ComponentProps<typeof Button>["size"]
  /** Disable the trigger (popover can't open). */
  disabled?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={triggerSize} disabled={disabled}>
          <Columns3 />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-64 overflow-y-auto p-1">
        <ColumnManagerMenuContent table={table} />
      </PopoverContent>
    </Popover>
  )
}
