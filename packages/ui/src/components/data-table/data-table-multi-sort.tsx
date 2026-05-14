"use client"

import type { Table } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "@workspace/ui/lib/icons"
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

import { getColumnLabel } from "./data-table-utils"

interface DataTableMultiSortProps<TData> {
  table: Table<TData>
  className?: string
}

export function DataTableMultiSort<TData>({
  table,
  className,
}: DataTableMultiSortProps<TData>) {
  const sorting = table.getState().sorting
  const setSorting = table.setSorting

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

  const move = React.useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= sorting.length) return
      const next = sorting.slice()
      const [item] = next.splice(index, 1)
      if (!item) return
      next.splice(target, 0, item)
      setSorting(next)
    },
    [setSorting, sorting],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        data-slot="data-table-multi-sort"
        align="end"
        className="w-[380px] p-3"
      >
        <div className="mb-2 text-sm font-semibold">Sort by</div>
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
              return (
                <div key={rule.id} className="flex items-center gap-1.5">
                  <Select
                    value={rule.id}
                    onValueChange={(nextId) =>
                      setSorting(
                        sorting.map((sort) =>
                          sort.id === rule.id ? { ...sort, id: nextId } : sort,
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
                    aria-label="Move sort up"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move sort down"
                    onClick={() => move(index, 1)}
                    disabled={index === sorting.length - 1}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove sort"
                    onClick={() =>
                      setSorting(sorting.filter((sort) => sort.id !== rule.id))
                    }
                  >
                    <Trash2 />
                  </Button>
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
