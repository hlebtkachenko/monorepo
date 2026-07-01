"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DataGrid } from "@workspace/ui/components/data-grid"

import {
  recomputeLine,
  UNIT_OPTIONS,
  VAT_RATE_OPTIONS,
  WAREHOUSE_OPTIONS,
} from "./data"

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
  /** String so it matches the VAT select cell's option values ("21"/"12"/"0"). */
  vatRate: string
  total: number
}

/**
 * The line-items columns — real editable cells (short-text / number / select),
 * not read-only text. `qty` · `unitPrice` · `vatRate` are the inputs; `base` and
 * `total` are derived (see `recomputeLine`) so they always reconcile. Cell
 * variants are declared on `meta.cell` per the `data-grid` contract.
 */
const lineColumns: ColumnDef<LineRow>[] = [
  {
    accessorKey: "code",
    header: "Code",
    size: 120,
    meta: { label: "Code", cell: { variant: "short-text" } },
  },
  {
    accessorKey: "warehouse",
    header: "Warehouse",
    size: 150,
    meta: {
      label: "Warehouse",
      cell: { variant: "select", options: WAREHOUSE_OPTIONS },
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 260,
    meta: { label: "Name", cell: { variant: "short-text" } },
  },
  {
    accessorKey: "qty",
    header: "Qty",
    size: 96,
    meta: { label: "Qty", cell: { variant: "number", min: 0, decimals: 2 } },
  },
  {
    accessorKey: "unit",
    header: "Unit",
    size: 100,
    meta: { label: "Unit", cell: { variant: "select", options: UNIT_OPTIONS } },
  },
  {
    accessorKey: "unitPrice",
    header: "Unit price",
    size: 130,
    meta: {
      label: "Unit price",
      cell: { variant: "number", min: 0, decimals: 2 },
    },
  },
  {
    accessorKey: "vatRate",
    header: "VAT %",
    size: 120,
    meta: {
      label: "VAT rate",
      cell: { variant: "select", options: VAT_RATE_OPTIONS },
    },
  },
  {
    accessorKey: "base",
    header: "Base",
    size: 130,
    meta: { label: "Base", cell: { variant: "number", decimals: 2 } },
  },
  {
    accessorKey: "total",
    header: "Total",
    size: 140,
    meta: { label: "Total", cell: { variant: "number", decimals: 2 } },
  },
]

/**
 * The editable line-items grid — the real `data-grid` (inline edit, keyboard nav,
 * paste, sort, context-menu add/delete rows). The parent owns the rows; every
 * change is re-derived through `recomputeLine` so `base`/`total` (and the recap +
 * status bar that read them) stay reconciled.
 */
export function LineItemsGrid({
  rows,
  onRowsChange,
}: {
  rows: LineRow[]
  onRowsChange: (rows: LineRow[]) => void
}) {
  return (
    <DataGrid
      data={rows}
      columns={lineColumns}
      onDataChange={(next) => onRowsChange(next.map(recomputeLine))}
      rowHeight="short"
      height={300}
      className="w-full"
    />
  )
}
