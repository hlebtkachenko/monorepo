"use client"

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getColumnPinningStyle } from "./data-table-utils"

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>
  actionBar?: React.ReactNode
}

export function DataTable<TData>({
  table,
  actionBar,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  return (
    <div
      data-slot="data-table"
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div
        data-slot="data-table-container"
        className="overflow-hidden rounded-md border"
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getColumnPinningStyle({ column: header.column }),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(row.getIsSelected() && "bg-muted/50")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getColumnPinningStyle({ column: cell.column }),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div data-slot="data-table-footer" className="flex flex-col gap-2.5">
        {actionBar && selectedCount > 0 ? actionBar : null}
      </div>
    </div>
  )
}

export { DataTableColumnHeader } from "./data-table-column-header"
export {
  ColumnManagerMenuContent,
  DataTableColumnManager,
} from "./data-table-column-manager"
export { DataTableDateFilter } from "./data-table-date-filter"
export { DataTableFacetedFilter } from "./data-table-faceted-filter"
export { DataTableMultiSort } from "./data-table-multi-sort"
export { DataTablePagination } from "./data-table-pagination"
export { DataTableSkeleton } from "./data-table-skeleton"
export { DataTableSliderFilter } from "./data-table-slider-filter"
export { DataTableToolbar } from "./data-table-toolbar"
export { DataTableViewOptions } from "./data-table-view-options"
export { useDataTable } from "./use-data-table"
export type { UseDataTableProps } from "./use-data-table"
export {
  getColumnLabel,
  getColumnPinningStyle,
  type DataTableColumnMeta,
  type DataTableFilterOption,
  type DataTableFilterVariant,
  type ExtendedColumnSort,
} from "./data-table-utils"
