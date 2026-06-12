"use client"

import * as React from "react"

import type { CellOpts, DataGridCellProps } from "./data-grid"
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

type CellComponent = <TData>(props: DataGridCellProps<TData>) => React.ReactNode

const CELL_COMPONENTS: Record<CellOpts["variant"], CellComponent> = {
  "short-text": ShortTextCell,
  "long-text": LongTextCell,
  number: NumberCell,
  url: UrlCell,
  checkbox: CheckboxCell,
  select: SelectCell,
  "multi-select": MultiSelectCell,
  date: DateCell,
  file: FileCell,
}

function DataGridCellImpl<TData>(props: DataGridCellProps<TData>) {
  const variant =
    props.cell.column.columnDef.meta?.cell?.variant ?? "short-text"
  // Out-of-union variant strings can arrive through cast columnDef.meta;
  // fall back to ShortTextCell like the pre-Record switch default did.
  const CellVariant = CELL_COMPONENTS[variant] ?? ShortTextCell
  return <CellVariant {...props} />
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
