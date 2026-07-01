"use client"

import type { Table } from "@tanstack/react-table"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Columns3, Eye, EyeOff, GripVertical } from "@workspace/ui/lib/icons"
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
 * The column manager menu body — a titled, drag-reorderable list (grip handle +
 * a dark separator at the drop position) where each row's eye toggles
 * visibility. Generic over any TanStack `Table<TData>`; reads only `getCanHide`
 * / `getIsVisible` / column order, so it has zero per-table knowledge.
 *
 * Render it inside any dropdown surface — a toolbar "Columns" button (see
 * `DataTableColumnManager`) or a grid's "+ Add column" trigger.
 */
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
  const columns = table.getAllColumns().filter((column) => column.getCanHide())

  return (
    <>
      <DropdownMenuLabel>Columns</DropdownMenuLabel>
      {columns.map((column) => {
        const visible = column.getIsVisible()
        const ToggleIcon = visible ? Eye : EyeOff
        const label = getColumnLabel(column)
        const over = dropTarget?.id === column.id
        return (
          <div key={column.id} className="relative">
            {over && dropTarget.edge === "top" ? (
              <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
            <div
              draggable
              onDragStart={(event) => {
                // setData + effectAllowed are required for the drag to actually
                // start (Firefox) and for the native "held" drag image to show.
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", column.id)
                setDragId(column.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropTarget(null)
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === column.id) return
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
                  reorderColumn(
                    table,
                    dragId,
                    column.id,
                    dropTarget?.edge ?? "top",
                  )
                }
                setDragId(null)
                setDropTarget(null)
              }}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                // The dragged row "lifts": it dims in place while its full-opacity
                // native ghost follows the cursor.
                dragId === column.id && "opacity-40",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
              <span
                className={cn(
                  "flex-1 truncate",
                  !visible && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <button
                type="button"
                aria-label={visible ? `Hide ${label}` : `Show ${label}`}
                onClick={() => column.toggleVisibility(!visible)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ToggleIcon className="size-4" />
              </button>
            </div>
            {over && dropTarget.edge === "bottom" ? (
              <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/**
 * Ready-made toolbar control: an outline "Columns" button that opens the
 * `ColumnManagerMenuContent` in a dropdown. Drop it in a `ContentToolbar`'s
 * right cluster; for a different trigger (e.g. a grid's "+ Add column") render
 * `ColumnManagerMenuContent` inside your own dropdown instead.
 */
export function DataTableColumnManager<TData>({
  table,
  label = "Columns",
}: {
  table: Table<TData>
  label?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <ColumnManagerMenuContent table={table} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
