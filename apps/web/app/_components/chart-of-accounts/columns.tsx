"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { useChart } from "./context"
import type { AccountRow } from "./data"

function InspectCell({ row }: { row: AccountRow }) {
  const { openInspector } = useChart()
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

const NATURE_LABEL: Record<string, string> = {
  ASSET: "Aktiva",
  LIABILITY: "Pasiva",
  EQUITY: "Kapitál",
  EXPENSE: "Náklady",
  REVENUE: "Výnosy",
  CLOSING: "Uzávěrka",
}

/** MD (debit) / Dal (credit) short labels for the normal-balance side. */
function normalBalanceLabel(value: AccountRow["normalBalance"]): string {
  if (value === "DEBIT") return "MD"
  if (value === "CREDIT") return "Dal"
  return "—"
}

/** TanStack column defs for the účtový rozvrh table. */
export const chartColumns: ColumnDef<AccountRow>[] = [
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
    size: 260,
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
    accessorKey: "normalBalance",
    header: "Normal balance",
    size: 130,
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {normalBalanceLabel(row.original.normalBalance)}
      </span>
    ),
    meta: { label: "Normal balance" },
    enableSorting: true,
  },
  {
    accessorKey: "active",
    header: "Active",
    size: 100,
    cell: ({ row }) =>
      row.original.active ? (
        <Badge variant="outline">Aktivní</Badge>
      ) : (
        <Badge variant="secondary">Neaktivní</Badge>
      ),
    meta: { label: "Active" },
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
