"use client"

import type { Table } from "@tanstack/react-table"
import { ArrowUpDown, GripVertical, Trash2 } from "@workspace/ui/lib/icons"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { getColumnLabel } from "./data-table-utils"

interface DataTableMultiSortProps<TData> {
  table: Table<TData>
  className?: string
  /** Optional tooltip on the trigger button. */
  tooltip?: string
}

export function DataTableMultiSort<TData>({
  table,
  className,
  tooltip,
}: DataTableMultiSortProps<TData>) {
  const sorting = table.getState().sorting
  const setSorting = table.setSorting

  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    index: number
    edge: "top" | "bottom"
  } | null>(null)

  const sortableColumns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanSort()),
    [table],
  )

  const addSort = React.useCallback(() => {
    const used = new Set(sorting.map((rule) => rule.id))
    const next = sortableColumns.find((column) => !used.has(column.id))
    if (!next) return
    setSorting([...sorting, { id: next.id, desc: false }])
  }, [setSorting, sortableColumns, sorting])

  const reset = React.useCallback(() => setSorting([]), [setSorting])

  // Drag a rule's grip handle to reorder the sort priority — `edge` is which
  // side of the target row the cursor is on (the drop separator).
  const reorderEdge = React.useCallback(
    (from: number, index: number, edge: "top" | "bottom") => {
      setSorting((prev) => {
        let to = edge === "bottom" ? index + 1 : index
        if (from < to) to -= 1
        if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) {
          return prev
        }
        if (from === to) return prev
        const next = prev.slice()
        const [item] = next.splice(from, 1)
        if (!item) return prev
        next.splice(to, 0, item)
        return next
      })
    },
    [setSorting],
  )

  const triggerButton = (
    <Button
      data-slot="data-table-multi-sort-trigger"
      variant="outline"
      size="sm"
      className={cn(className)}
    >
      <ArrowUpDown />
      Sort
      {sorting.length > 0 && (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
          {sorting.length}
        </Badge>
      )}
    </Button>
  )

  return (
    <Popover>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      )}
      <PopoverContent
        data-slot="data-table-multi-sort"
        align="end"
        className="w-[380px] p-3"
      >
        {/* Group-label token style — matches the Columns dropdown heading. */}
        <div className="mb-1 px-1.5 py-1 text-xs font-medium text-muted-foreground">
          Sort by
        </div>
        {sorting.length === 0 ? (
          <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            No sorts applied. Add one to begin.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorting.map((rule, index) => {
              const usedElsewhere = new Set(
                sorting.filter((s) => s.id !== rule.id).map((s) => s.id),
              )
              const available = sortableColumns.filter(
                (column) => !usedElsewhere.has(column.id),
              )
              const over = dropTarget?.index === index
              return (
                <div key={rule.id} className="relative">
                  {over && dropTarget.edge === "top" ? (
                    <span className="pointer-events-none absolute inset-x-0 -top-1 z-10 h-0.5 rounded-full bg-foreground" />
                  ) : null}
                  <div
                    className={cn(
                      "flex items-center gap-1.5",
                      dragIndex === index && "opacity-50",
                    )}
                    onDragOver={(event) => {
                      if (dragIndex === null || dragIndex === index) return
                      event.preventDefault()
                      event.stopPropagation()
                      event.dataTransfer.dropEffect = "move"
                      const rect = event.currentTarget.getBoundingClientRect()
                      const edge =
                        event.clientY < rect.top + rect.height / 2
                          ? "top"
                          : "bottom"
                      setDropTarget({ index, edge })
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (dragIndex !== null) {
                        reorderEdge(dragIndex, index, dropTarget?.edge ?? "top")
                      }
                      setDragIndex(null)
                      setDropTarget(null)
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Reorder sort"
                      draggable
                      onDragStart={(event) => {
                        // setData + effectAllowed are required for the drag to
                        // actually start and show the native "held" image.
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", rule.id)
                        setDragIndex(index)
                      }}
                      onDragEnd={() => {
                        setDragIndex(null)
                        setDropTarget(null)
                      }}
                      className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <Select
                      value={rule.id}
                      onValueChange={(nextId) =>
                        setSorting(
                          sorting.map((sort) =>
                            sort.id === rule.id
                              ? { ...sort, id: nextId }
                              : sort,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 flex-1">
                        <SelectValue placeholder="Column" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((column) => (
                          <SelectItem key={column.id} value={column.id}>
                            {getColumnLabel(column)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={rule.desc ? "desc" : "asc"}
                      onValueChange={(value) =>
                        setSorting(
                          sorting.map((sort) =>
                            sort.id === rule.id
                              ? { ...sort, desc: value === "desc" }
                              : sort,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-[88px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">Asc</SelectItem>
                        <SelectItem value="desc">Desc</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove sort"
                      onClick={() =>
                        setSorting(
                          sorting.filter((sort) => sort.id !== rule.id),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {over && dropTarget.edge === "bottom" ? (
                    <span className="pointer-events-none absolute inset-x-0 -bottom-1 z-10 h-0.5 rounded-full bg-foreground" />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={addSort}
            disabled={sorting.length >= sortableColumns.length}
          >
            Add sort
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={reset}
            disabled={sorting.length === 0}
          >
            Reset sorting
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
