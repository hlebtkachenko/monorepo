"use client"

import * as React from "react"
import { flexRender, type Header, type Table } from "@tanstack/react-table"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { GripVertical } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { DataGridViewColumnHeader } from "./data-grid-view-column-header"
import {
  PinShadow,
  borderClass,
  pinStyle,
  type ScrollEdges,
} from "./data-grid-view-pin"

/**
 * One drag-sortable header cell, used for ALL three groups (left-pinned,
 * centre, right-pinned) — each group is its own `SortableContext`, so a column
 * only ever reorders WITHIN its group, never out of it. The drag `listeners`
 * live on a small grip button (revealed on hover / focus) so drag never
 * collides with the header's dropdown trigger or the trailing resize handle,
 * and so the KeyboardSensor works (Tab to the grip, Space to lift, arrows to
 * move).
 *
 * Pinned cells keep their `position: sticky` freeze: the dnd-kit
 * `CSS.Translate` transform is applied ONLY to centre cells — a transform on a
 * sticky element creates a new containing block and breaks the freeze, so for
 * pinned cells the drag is shown by the shared `DragOverlay` (the source cell
 * just dims) rather than by moving the sticky cell itself. Reorder writes the
 * matching state slice (centre → `columnOrder`, pinned → `columnPinning`) in the
 * DndContext `onDragEnd`.
 */
export function SortableHeaderCell<TData>({
  header,
  table,
  edges,
  upper = false,
  onColumnFilter,
  onColumnAnalyze,
}: {
  header: Header<TData, unknown>
  table: Table<TData>
  edges: ScrollEdges
  /** This cell sits in an upper (grouping) header tier — tint it accordingly. */
  upper?: boolean
  onColumnFilter?: (columnId: string) => void
  onColumnAnalyze?: (columnId: string) => void
}) {
  const { column } = header
  const interactive = column.getCanSort() || column.getCanHide()
  // Structural columns (select / actions) set canSort + canHide false, so they
  // stay non-draggable anchors; every data column — pinned or not — can drag.
  // A column may still opt OUT of reordering while keeping sort (pivot columns:
  // sortable by value, but structurally fixed in their header hierarchy).
  const canReorder = interactive && !column.columnDef.meta?.disableReorder
  const align = column.columnDef.meta?.align
  const pinned = column.getIsPinned()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, disabled: !canReorder })

  const isResizing =
    table.getState().columnSizingInfo.isResizingColumn !== false

  return (
    <div
      ref={setNodeRef}
      role="columnheader"
      data-slot="grid-header-cell"
      className={cn(
        "group/col relative flex h-9 shrink-0 items-center text-muted-foreground",
        // Upper (grouping) tier cells get the group band tint and no hover; leaf
        // header cells keep the normal header surface + hover.
        upper
          ? "bg-grid-header-group"
          : "bg-grid-header hover:bg-grid-header-hover",
        borderClass(column),
      )}
      style={{
        ...pinStyle(column),
        // Axis is clamped to X by the DndContext's restrictToHorizontalAxis
        // modifier. Pinned cells stay sticky (no transform) — the DragOverlay
        // carries the visual; only centre cells translate with the pointer.
        ...(pinned
          ? {}
          : { transform: CSS.Translate.toString(transform), transition }),
        width: `calc(var(--header-${header.id}-size) * 1px)`,
        zIndex: isDragging ? 3 : pinned ? 2 : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {canReorder ? (
        <button
          type="button"
          aria-label="Drag to reorder column"
          disabled={isResizing}
          className="absolute left-0 z-30 flex h-full w-3 cursor-grab touch-none items-center justify-center text-muted-foreground opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : null}
      {header.isPlaceholder ? null : interactive ? (
        <DataGridViewColumnHeader
          header={header}
          table={table}
          onColumnFilter={onColumnFilter}
          onColumnAnalyze={onColumnAnalyze}
        />
      ) : (
        <div
          className={cn(
            "flex size-full items-center px-3",
            align === "center" && "justify-center px-0",
            align === "end" && "justify-end",
          )}
        >
          {flexRender(column.columnDef.header, header.getContext())}
        </div>
      )}
      <PinShadow column={column} edges={edges} />
    </div>
  )
}
