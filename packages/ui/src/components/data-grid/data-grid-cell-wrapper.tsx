"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { DataGridCellProps } from "./data-grid"

interface DataGridCellWrapperProps<TData> extends Omit<
  DataGridCellProps<TData>,
  "cell"
> {
  className?: string
  children?: React.ReactNode
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

function DataGridCellWrapperImpl<TData>(
  {
    tableMeta,
    rowIndex,
    columnId,
    rowHeight,
    isEditing,
    isFocused,
    isSelected,
    readOnly,
    className,
    children,
    onClick: onClickProp,
    onKeyDown: onKeyDownProp,
  }: DataGridCellWrapperProps<TData>,
  ref: React.Ref<HTMLDivElement>,
) {
  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isEditing) return
      event.preventDefault()
      onClickProp?.(event)
      if (isFocused && !readOnly) {
        tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      } else {
        tableMeta?.onCellClick?.(rowIndex, columnId)
      }
    },
    [
      tableMeta,
      rowIndex,
      columnId,
      isEditing,
      isFocused,
      readOnly,
      onClickProp,
    ],
  )

  const onDoubleClick = React.useCallback(() => {
    if (isEditing) return
    tableMeta?.onCellDoubleClick?.(rowIndex, columnId)
  }, [tableMeta, rowIndex, columnId, isEditing])

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isEditing) return
      tableMeta?.onCellContextMenu?.(rowIndex, columnId, event)
    },
    [tableMeta, rowIndex, columnId, isEditing],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(event)
      if (event.defaultPrevented) return
      if (!isFocused || isEditing || readOnly) return
      if (event.key === "Enter" || event.key === "F2" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        tableMeta?.onCellEditingStart?.(rowIndex, columnId)
        return
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        tableMeta?.onCellEditingStart?.(rowIndex, columnId)
      }
    },
    [
      onKeyDownProp,
      isFocused,
      isEditing,
      readOnly,
      tableMeta,
      rowIndex,
      columnId,
    ],
  )

  return (
    <div
      role="button"
      data-slot="data-grid-cell-wrapper"
      data-editing={isEditing ? "" : undefined}
      data-focused={isFocused ? "" : undefined}
      data-selected={isSelected ? "" : undefined}
      tabIndex={isFocused && !isEditing ? 0 : -1}
      ref={ref}
      className={cn(
        "size-full px-2 py-1.5 text-start text-sm outline-none",
        "cursor-default has-data-[slot=checkbox]:pt-2.5",
        isFocused && "ring-2 ring-primary ring-inset",
        isSelected && !isEditing && "bg-muted/50",
        isEditing && "bg-primary/5",
        !isEditing &&
          rowHeight === "short" &&
          "**:data-[slot=data-grid-cell-content]:line-clamp-1",
        !isEditing &&
          rowHeight === "medium" &&
          "**:data-[slot=data-grid-cell-content]:line-clamp-2",
        !isEditing &&
          rowHeight === "tall" &&
          "**:data-[slot=data-grid-cell-content]:line-clamp-3",
        !isEditing &&
          rowHeight === "extra-tall" &&
          "**:data-[slot=data-grid-cell-content]:line-clamp-4",
        className,
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}

export const DataGridCellWrapper = React.forwardRef(
  DataGridCellWrapperImpl,
) as <TData>(
  props: DataGridCellWrapperProps<TData> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement
