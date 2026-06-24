"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DataTableColumnHeader } from "@workspace/ui/components/data-table"

import {
  FAKTURY_STAV_OPTIONS,
  formatCzk,
  formatDate,
  type FakturaRow,
  type FakturaStav,
} from "./data"

const STAV_BADGE: Record<
  FakturaStav,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  Nová: "outline",
  "Ke schválení": "secondary",
  Schváleno: "default",
  Zaúčtováno: "ghost",
}

/** TanStack column defs for the Faktury přijaté demo table. Static — no app
 *  state — so they live in their own module (standard TanStack pattern). */
export const fakturyColumns: ColumnDef<FakturaRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Vybrat vše"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Vybrat ${row.original.doklad}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "doklad",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Doklad" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.original.doklad}</span>
    ),
    meta: { label: "Doklad" },
    enableSorting: true,
  },
  {
    accessorKey: "partner",
    header: "Partner",
    meta: {
      label: "Partner",
      variant: "text",
      placeholder: "Hledat partnera…",
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: "stav",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Stav" />
    ),
    cell: ({ row }) => (
      <Badge variant={STAV_BADGE[row.original.stav]}>{row.original.stav}</Badge>
    ),
    meta: {
      label: "Stav",
      variant: "multiSelect",
      options: FAKTURY_STAV_OPTIONS,
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    accessorKey: "castka",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Částka" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCzk(row.original.castka)}
      </div>
    ),
    meta: { label: "Částka" },
    enableSorting: true,
  },
  {
    accessorKey: "dph",
    header: "DPH",
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {formatCzk(row.original.dph)}
      </div>
    ),
    meta: { label: "DPH" },
  },
  {
    accessorKey: "datum",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Datum" />
    ),
    cell: ({ row }) => formatDate(row.original.datum),
    meta: { label: "Datum" },
    enableSorting: true,
  },
]
