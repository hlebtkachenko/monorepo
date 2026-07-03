"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { formatDecimal } from "../_shared/accounting-format"
import { useLedger } from "./context"
import type { LedgerRow } from "./data"

function InspectCell({ row }: { row: LedgerRow }) {
  const { openInspector } = useLedger()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for account ${row.accountNumber}`}
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

const NATURE_LABEL: Record<string, string> = {
  ASSET: "Aktiva",
  LIABILITY: "Pasiva",
  EQUITY: "Kapitál",
  EXPENSE: "Náklady",
  REVENUE: "Výnosy",
  CLOSING: "Uzávěrka",
}

/** TanStack column defs for the hlavní kniha / obratová předvaha table. */
export const ledgerColumns: ColumnDef<LedgerRow>[] = [
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
        aria-label={`Select ${row.original.accountNumber}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
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
    accessorKey: "accountName",
    header: "Name",
    size: 220,
    meta: { label: "Name" },
    enableSorting: true,
  },
  {
    accessorKey: "nature",
    header: "Nature",
    size: 110,
    cell: ({ row }) => (
      <Badge variant="outline">
        {NATURE_LABEL[row.original.nature] ?? row.original.nature}
      </Badge>
    ),
    meta: {
      label: "Nature",
      variant: "multiSelect",
      options: Object.entries(NATURE_LABEL).map(([value, label]) => ({
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
    accessorKey: "openingBalance",
    header: "Opening",
    size: 130,
    cell: ({ row }) => amountCell(row.original.openingBalance, true),
    meta: { label: "Opening" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.openingBalance) - Number(b.original.openingBalance),
  },
  {
    accessorKey: "turnoverDebit",
    header: "Turnover MD",
    size: 130,
    cell: ({ row }) => amountCell(row.original.turnoverDebit),
    meta: { label: "Turnover MD" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.turnoverDebit) - Number(b.original.turnoverDebit),
  },
  {
    accessorKey: "turnoverCredit",
    header: "Turnover Dal",
    size: 130,
    cell: ({ row }) => amountCell(row.original.turnoverCredit),
    meta: { label: "Turnover Dal" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.turnoverCredit) - Number(b.original.turnoverCredit),
  },
  {
    accessorKey: "closingBalance",
    header: "Closing",
    size: 130,
    cell: ({ row }) => amountCell(row.original.closingBalance),
    meta: { label: "Closing" },
    enableSorting: true,
    sortingFn: (a, b) =>
      Number(a.original.closingBalance) - Number(b.original.closingBalance),
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
