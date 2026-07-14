"use client"

import * as React from "react"
import { flexRender, type Header, type Table } from "@tanstack/react-table"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { GripVertical } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { DataGridViewColumnHeader } from "./data-grid-view-column-header"

/**
 * One CENTER (non-pinned) header cell made drag-sortable via dnd-kit. The drag
 * `listeners` live on a small grip button (revealed on hover / focus) so drag
 * never collides with the header's dropdown trigger or the trailing resize
 * handle, and so the KeyboardSensor works (Tab to the grip, Space to lift,
 * arrows to move). Pinned-left/right header cells never use this — they stay
 * plain. Reorder writes the shared `columnOrder` (see the DndContext onDragEnd).
 */
export function SortableHeaderCell<TData>({
  header,
  table,
  onColumnFilter,
  onColumnAnalyze,
}: {
  header: Header<TData, unknown>
  table: Table<TData>
  onColumnFilter?: (columnId: string) => void
  onColumnAnalyze?: (columnId: string) => void
}) {
  const { column } = header
  const interactive = column.getCanSort() || column.getCanHide()
  const canReorder = interactive
  const align = column.columnDef.meta?.align

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
      className="group/col relative flex h-9 shrink-0 items-center border-e border-border-subtle/60 bg-muted text-muted-foreground"
      style={{
        // Axis is clamped to X by the DndContext's restrictToHorizontalAxis
        // modifier, so the translate is effectively translateX.
        transform: CSS.Translate.toString(transform),
        transition,
        width: `calc(var(--header-${header.id}-size) * 1px)`,
        zIndex: isDragging ? 3 : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {canReorder ? (
        <button
          type="button"
          aria-label="Drag to reorder column"
          disabled={isResizing}
          className="absolute left-0 z-30 flex h-full w-4 cursor-grab touch-none items-center justify-center text-muted-foreground/50 opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
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
            "flex size-full items-center",
            align === "center" ? "justify-center px-0" : "px-3",
          )}
        >
          {flexRender(column.columnDef.header, header.getContext())}
        </div>
      )}
    </div>
  )
}
