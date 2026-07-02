"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DataGrid } from "@workspace/ui/components/data-grid"

import {
  recomputeLine,
  UNIT_OPTIONS,
  VAT_RATE_OPTIONS,
  WAREHOUSE_OPTIONS,
} from "./data"

/**
 * One doklad line (položka) as held by the editable grid — money as JS numbers.
 * The fixture stores decimal strings; `linesToRows` coerces them to this shape.
 * `qty` · `unitPrice` · `vatRate` are the inputs; `base` · `vat` · `total` are
 * derived (see `recomputeLine`) so they always reconcile.
 */
export interface LineRow {
  id: string
  code: string
  warehouse: string
  name: string
  qty: number
  unit: string
  unitPrice: number
  base: number
  vat: number
  total: number
  /** String so it matches the VAT select cell's option values ("21"/"12"/"0"). */
  vatRate: string
}

/**
 * The line-items columns — real editable cells (short-text / number / select),
 * not read-only text. `qty` · `unitPrice` · `vatRate` are the inputs; `base`,
 * `vat`, and `total` are derived (see `recomputeLine`) so they always reconcile.
 * Cell variants are declared on `meta.cell` per the `data-grid` contract.
 */
const lineColumns: ColumnDef<LineRow>[] = [
  {
    accessorKey: "code",
    header: "Kód",
    size: 120,
    meta: { label: "Kód", cell: { variant: "short-text" } },
  },
  {
    accessorKey: "warehouse",
    header: "Sklad",
    size: 130,
    meta: {
      label: "Sklad",
      cell: { variant: "select", options: WAREHOUSE_OPTIONS },
    },
  },
  {
    accessorKey: "name",
    header: "Název",
    size: 260,
    meta: { label: "Název", cell: { variant: "short-text" } },
  },
  {
    accessorKey: "qty",
    header: "Množství",
    size: 96,
    meta: {
      label: "Množství",
      cell: { variant: "number", min: 0, decimals: 2 },
    },
  },
  {
    accessorKey: "unit",
    header: "MJ",
    size: 90,
    meta: { label: "MJ", cell: { variant: "select", options: UNIT_OPTIONS } },
  },
  {
    accessorKey: "unitPrice",
    header: "Jedn. cena",
    size: 130,
    meta: {
      label: "Jednotková cena",
      cell: { variant: "number", min: 0, decimals: 2 },
    },
  },
  {
    accessorKey: "vatRate",
    header: "DPH %",
    size: 110,
    meta: {
      label: "Sazba DPH",
      cell: { variant: "select", options: VAT_RATE_OPTIONS },
    },
  },
  {
    accessorKey: "base",
    header: "Základ",
    size: 130,
    meta: { label: "Základ", cell: { variant: "number", decimals: 2 } },
  },
  {
    accessorKey: "vat",
    header: "DPH",
    size: 120,
    meta: { label: "DPH", cell: { variant: "number", decimals: 2 } },
  },
  {
    accessorKey: "total",
    header: "Celkem",
    size: 140,
    meta: { label: "Celkem", cell: { variant: "number", decimals: 2 } },
  },
]

/**
 * The editable line-items grid — the real `data-grid` (inline edit, keyboard
 * nav, paste, sort, context-menu add/delete rows). The parent owns the rows;
 * every change is re-derived through `recomputeLine` so `base`/`vat`/`total`
 * (and the recap + status bar that read them) stay reconciled.
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
