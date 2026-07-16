"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { formatDate, formatDecimal } from "../_shared/accounting-format"
import { buildSourceColumn } from "../_shared/source-column"
import { useSaldokonto } from "./context"
import type { OpenItemRow } from "./data"

function InspectCell({ row }: { row: OpenItemRow }) {
  const { openInspector } = useSaldokonto()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for open item ${row.variableSymbol ?? row.id}`}
      onClick={() => openInspector(row)}
    >
      <Icon />
    </Button>
  )
}

/** Numeric cell rendering a Decimal string right-aligned. */
function amountCell(value: string, muted = false) {
  return (
    <div
      className={`text-right tabular-nums${muted ? "text-muted-foreground" : "font-medium"}`}
    >
      {formatDecimal(value)}
    </div>
  )
}

export const DIRECTION_LABEL: Record<string, string> = {
  RECEIVABLE: "Receivable",
  PAYABLE: "Payable",
}

/** TanStack column defs for the saldokonto (open items) table. */
export const saldokontoColumns: ColumnDef<OpenItemRow>[] = [
  {
    id: "select",
    size: 32,
    minSize: 32,
    maxSize: 32,
    meta: { align: "center" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        className="border-primary"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.variableSymbol ?? row.original.id}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: "variableSymbol",
    header: "Doklad",
    size: 130,
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {row.original.variableSymbol ?? "—"}
      </span>
    ),
    meta: { label: "Doklad" },
    enableSorting: true,
  },
  {
    accessorKey: "accountNumber",
    header: "Account",
    size: 110,
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {row.original.accountNumber}
      </span>
    ),
    meta: { label: "Account" },
    enableSorting: true,
  },
  {
    accessorKey: "direction",
    header: "Direction",
    size: 120,
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.direction === "RECEIVABLE" ? "default" : "secondary"
        }
      >
        {DIRECTION_LABEL[row.original.direction] ?? row.original.direction}
      </Badge>
    ),
    meta: {
      label: "Direction",
      variant: "multiSelect",
      options: Object.entries(DIRECTION_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    accessorKey: "originalAmount",
    header: "Original",
    size: 130,
    cell: ({ row }) => amountCell(row.original.originalAmount, true),
    meta: { label: "Original" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.originalAmount) - Number(b.original.originalAmount),
  },
  {
    accessorKey: "settledAmount",
    header: "Settled",
    size: 130,
    cell: ({ row }) => amountCell(row.original.settledAmount, true),
    meta: { label: "Settled" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.settledAmount) - Number(b.original.settledAmount),
  },
  {
    accessorKey: "remainingAmount",
    header: "Remaining",
    size: 130,
    cell: ({ row }) => amountCell(row.original.remainingAmount),
    meta: { label: "Remaining" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.remainingAmount) - Number(b.original.remainingAmount),
  },
  {
    accessorKey: "dueDate",
    header: "Due",
    size: 120,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.dueDate ? formatDate(row.original.dueDate) : "—"}
      </span>
    ),
    meta: { label: "Due" },
    enableSorting: true,
  },
  buildSourceColumn<OpenItemRow>((row) => (row.inboxId ? "agent" : "human")),
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
