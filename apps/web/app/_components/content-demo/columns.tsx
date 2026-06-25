"use client"

import * as React from "react"
import type { ColumnDef, Row, Table } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { useOrgContent } from "./context"
import {
  INVOICE_STATUS_OPTIONS,
  formatDate,
  formatMoney,
  type InvoiceRow,
  type InvoiceStatus,
} from "./data"

const STATUS_BADGE: Record<
  InvoiceStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  New: "outline",
  "To approve": "secondary",
  Approved: "default",
  Posted: "ghost",
}

// Anchor for shift-range selection (the last row checkbox clicked without
// shift). Module-level because the column defs are static and there is one
// demo table; stored as a row id so it survives sort / filter / pagination.
const selectAnchorId: { current: string | null } = { current: null }

/** Row select checkbox with shift-click range selection across the visible page. */
function SelectCell({
  row,
  table,
}: {
  row: Row<InvoiceRow>
  table: Table<InvoiceRow>
}) {
  const checked = row.getIsSelected()
  return (
    <Checkbox
      aria-label={`Select ${row.original.document}`}
      checked={checked}
      onClick={(event) => {
        if (event.shiftKey && selectAnchorId.current !== null) {
          event.preventDefault()
          const rows = table.getRowModel().rows
          const a = rows.findIndex((r) => r.id === selectAnchorId.current)
          const b = rows.findIndex((r) => r.id === row.id)
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            const next = { ...table.getState().rowSelection }
            for (let i = lo; i <= hi; i++) {
              const r = rows[i]
              if (r) next[r.id] = true
            }
            table.setRowSelection(next)
          }
        } else {
          row.toggleSelected(!checked)
          selectAnchorId.current = row.id
        }
      }}
    />
  )
}

/** Row affordance that opens the Inspector for this invoice. A real component
 *  (not an inline cell fn) so it can use the context hook. */
function InspectCell({ row }: { row: InvoiceRow }) {
  const { openInspector } = useOrgContent()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Details for ${row.document}`}
      onClick={() => openInspector(row)}
    >
      <Icon />
    </Button>
  )
}

/** TanStack column defs for the invoices demo table. Static — no app state —
 *  so they live in their own module (standard TanStack pattern). */
export const invoiceColumns: ColumnDef<InvoiceRow>[] = [
  {
    id: "select",
    // Square, fixed cell (matches the 32px body row height) with the checkbox
    // centered.
    size: 32,
    minSize: 32,
    maxSize: 32,
    meta: { align: "center" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        // Primary-colored so it stands out against the tinted header row.
        className="border-primary"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row, table }) => <SelectCell row={row} table={table} />,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: "document",
    header: "Document",
    size: 200,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.document}</span>
    ),
    meta: { label: "Document" },
    enableSorting: true,
  },
  {
    accessorKey: "partner",
    header: "Partner",
    size: 190,
    meta: { label: "Partner", variant: "text", placeholder: "Search partner…" },
    enableColumnFilter: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 150,
    cell: ({ row }) => (
      <Badge variant={STATUS_BADGE[row.original.status]}>
        {row.original.status}
      </Badge>
    ),
    meta: {
      label: "Status",
      variant: "multiSelect",
      options: INVOICE_STATUS_OPTIONS,
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    size: 130,
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatMoney(row.original.amount)}
      </div>
    ),
    meta: { label: "Amount" },
    enableSorting: true,
  },
  {
    accessorKey: "vat",
    header: "VAT",
    size: 110,
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {formatMoney(row.original.vat)}
      </div>
    ),
    meta: { label: "VAT" },
  },
  {
    accessorKey: "date",
    header: "Date",
    size: 130,
    cell: ({ row }) => formatDate(row.original.date),
    meta: { label: "Date" },
    enableSorting: true,
  },
  {
    id: "inspect",
    size: 44,
    minSize: 44,
    maxSize: 44,
    meta: { align: "center" },
    cell: ({ row }) => <InspectCell row={row.original} />,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
]
