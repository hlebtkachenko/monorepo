"use client"

import * as React from "react"
import type { Row, TableMeta } from "@tanstack/react-table"
import type { VirtualItem } from "@tanstack/react-virtual"

import { cn } from "@workspace/ui/lib/utils"

import {
  type CellPosition,
  type RowHeightValue,
  getCellKey,
  getRowHeightValue,
} from "./data-grid"
import { DataGridCell } from "./data-grid-cell"

interface DataGridRowProps<TData> {
  row: Row<TData>
  tableMeta: TableMeta<TData> | undefined
  virtualItem: VirtualItem
  rowHeight: RowHeightValue
  focusedCell: CellPosition | null
  editingCell: CellPosition | null
  searchMatchKeys: Set<string>
  activeSearchMatch: CellPosition | null
  readOnly: boolean
  gridTemplateColumns: string
}

function DataGridRowImpl<TData>({
  row,
  tableMeta,
  virtualItem,
  rowHeight,
  focusedCell,
  editingCell,
  searchMatchKeys,
  activeSearchMatch,
  readOnly,
  gridTemplateColumns,
}: DataGridRowProps<TData>) {
  const rowIndex = virtualItem.index
  const visibleCells = row.getVisibleCells()

  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      data-slot="data-grid-row"
      data-index={rowIndex}
      className={cn("absolute grid w-full border-b will-change-transform")}
      style={{
        height: `${getRowHeightValue(rowHeight)}px`,
        transform: `translateY(${virtualItem.start}px)`,
        gridTemplateColumns,
      }}
    >
      {visibleCells.map((cell, colIndex) => {
        const columnId = cell.column.id
        const isFocused =
          focusedCell?.rowIndex === rowIndex &&
          focusedCell?.columnId === columnId
        const isEditing =
          editingCell?.rowIndex === rowIndex &&
          editingCell?.columnId === columnId
        const cellKey = getCellKey(rowIndex, columnId)
        const isSearchMatch = searchMatchKeys.has(cellKey)
        const isActiveSearchMatch =
          activeSearchMatch?.rowIndex === rowIndex &&
          activeSearchMatch?.columnId === columnId

        return (
          <div
            key={cell.id}
            role="gridcell"
            aria-colindex={colIndex + 1}
            data-slot="data-grid-cell"
            className={cn(
              "min-w-0 border-r last:border-r-0",
              isSearchMatch && !isActiveSearchMatch && "bg-warning/15",
              isActiveSearchMatch && "bg-warning/30",
            )}
          >
            <DataGridCell
              cell={cell}
              tableMeta={tableMeta}
              rowIndex={rowIndex}
              columnId={columnId}
              rowHeight={rowHeight}
              isFocused={isFocused}
              isEditing={isEditing}
              isSelected={false}
              readOnly={readOnly}
            />
          </div>
        )
      })}
    </div>
  )
}

export const DataGridRow = React.memo(DataGridRowImpl, (prev, next) => {
  if (prev.row.id !== next.row.id) return false
  if (prev.row.original !== next.row.original) return false
  if (prev.virtualItem.start !== next.virtualItem.start) return false
  if (prev.rowHeight !== next.rowHeight) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.gridTemplateColumns !== next.gridTemplateColumns) return false
  if (prev.searchMatchKeys !== next.searchMatchKeys) return false

  const idx = prev.virtualItem.index
  const prevHasFocus = prev.focusedCell?.rowIndex === idx
  const nextHasFocus = next.focusedCell?.rowIndex === idx
  if (prevHasFocus !== nextHasFocus) return false
  if (nextHasFocus && prev.focusedCell?.columnId !== next.focusedCell?.columnId)
    return false

  const prevHasEditing = prev.editingCell?.rowIndex === idx
  const nextHasEditing = next.editingCell?.rowIndex === idx
  if (prevHasEditing !== nextHasEditing) return false
  if (
    nextHasEditing &&
    prev.editingCell?.columnId !== next.editingCell?.columnId
  )
    return false

  const prevActive = prev.activeSearchMatch?.rowIndex === idx
  const nextActive = next.activeSearchMatch?.rowIndex === idx
  if (prevActive !== nextActive) return false
  if (
    nextActive &&
    prev.activeSearchMatch?.columnId !== next.activeSearchMatch?.columnId
  ) {
    return false
  }

  return true
}) as typeof DataGridRowImpl
