"use client"

import * as React from "react"

import type { DataGridCellProps } from "./data-grid"
import {
  CheckboxCell,
  DateCell,
  FileCell,
  LongTextCell,
  MultiSelectCell,
  NumberCell,
  SelectCell,
  ShortTextCell,
  UrlCell,
} from "./data-grid-cell-variants"

function DataGridCellImpl<TData>(props: DataGridCellProps<TData>) {
  const variant =
    props.cell.column.columnDef.meta?.cell?.variant ?? "short-text"

  switch (variant) {
    case "long-text":
      return <LongTextCell {...props} />
    case "number":
      return <NumberCell {...props} />
    case "url":
      return <UrlCell {...props} />
    case "checkbox":
      return <CheckboxCell {...props} />
    case "select":
      return <SelectCell {...props} />
    case "multi-select":
      return <MultiSelectCell {...props} />
    case "date":
      return <DateCell {...props} />
    case "file":
      return <FileCell {...props} />
    case "short-text":
    default:
      return <ShortTextCell {...props} />
  }
}

export const DataGridCell = React.memo(DataGridCellImpl, (prev, next) => {
  if (prev.isFocused !== next.isFocused) return false
  if (prev.isEditing !== next.isEditing) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.rowIndex !== next.rowIndex) return false
  if (prev.columnId !== next.columnId) return false
  if (prev.rowHeight !== next.rowHeight) return false
  const prevValue = (prev.cell.row.original as Record<string, unknown>)[
    prev.columnId
  ]
  const nextValue = (next.cell.row.original as Record<string, unknown>)[
    next.columnId
  ]
  if (prevValue !== nextValue) return false
  if (prev.cell.row.id !== next.cell.row.id) return false
  return true
}) as typeof DataGridCellImpl
