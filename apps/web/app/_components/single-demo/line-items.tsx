"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { useDataTable } from "@workspace/ui/components/data-table"

import { formatNum } from "./data"

/** One invoice line (položka). */
export interface LineRow {
  id: string
  code: string
  warehouse: string
  name: string
  qty: number
  unit: string
  unitPrice: number
  base: number
  vatRate: number
  total: number
}

const right = (value: React.ReactNode, strong = false) => (
  <div
    className={
      strong ? "text-right font-medium tabular-nums" : "text-right tabular-nums"
    }
  >
    {value}
  </div>
)

const lineColumns: ColumnDef<LineRow>[] = [
  { accessorKey: "code", header: "Code", size: 110, meta: { label: "Code" } },
  {
    accessorKey: "warehouse",
    header: "Warehouse",
    size: 120,
    meta: { label: "Warehouse" },
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 240,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    meta: { label: "Name" },
  },
  {
    accessorKey: "qty",
    header: "Qty",
    size: 72,
    cell: ({ row }) => right(formatNum(row.original.qty)),
    meta: { label: "Qty" },
  },
  { accessorKey: "unit", header: "Unit", size: 64, meta: { label: "Unit" } },
  {
    accessorKey: "unitPrice",
    header: "Unit price",
    size: 110,
    cell: ({ row }) => right(formatNum(row.original.unitPrice)),
    meta: { label: "Unit price" },
  },
  {
    accessorKey: "base",
    header: "Base",
    size: 110,
    cell: ({ row }) => right(formatNum(row.original.base)),
    meta: { label: "Base" },
  },
  {
    accessorKey: "vatRate",
    header: "VAT %",
    size: 72,
    cell: ({ row }) => right(`${row.original.vatRate} %`),
    meta: { label: "VAT rate" },
  },
  {
    accessorKey: "total",
    header: "Total",
    size: 120,
    cell: ({ row }) => right(formatNum(row.original.total), true),
    meta: { label: "Total" },
  },
]

/** The line-items grid — our Table machinery (useDataTable + DataGridView). */
export function LineItemsGrid({ rows }: { rows: LineRow[] }) {
  const { table } = useDataTable<LineRow>({
    data: rows,
    columns: lineColumns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 140, maxSize: 480 },
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  })

  // Fill the bounded line-items region (the parent gives it a real height) and
  // scroll inside — so the grid reads as a proper, usable table, not a column
  // of rows that pushes the page.
  return <DataGridView table={table} className="min-h-0 flex-1" />
}
