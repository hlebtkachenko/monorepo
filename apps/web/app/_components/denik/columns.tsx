"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { formatDecimal, formatDate } from "../_shared/accounting-format"
import { useDenik } from "./context"
import type { JournalRow } from "./data"

/** Row affordance opening the Inspector for this journal line. */
function InspectCell({ row }: { row: JournalRow }) {
  const { openInspector } = useDenik()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Detail for ${row.summaryDesignation}`}
      onClick={() => openInspector(row)}
    >
      <Icon />
    </Button>
  )
}

/** TanStack column defs for the deník (journal) table — static, no app state. */
export const journalColumns: ColumnDef<JournalRow>[] = [
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
        aria-label={`Select ${row.original.summaryDesignation}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: "postingDate",
    header: "Date",
    size: 120,
    cell: ({ row }) => formatDate(row.original.postingDate),
    meta: { label: "Date" },
    enableSorting: true,
  },
  {
    accessorKey: "summaryDesignation",
    header: "Doklad",
    size: 160,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.summaryDesignation}</span>
    ),
    meta: { label: "Doklad" },
    enableSorting: true,
  },
  {
    accessorKey: "eventDescription",
    header: "Popis",
    size: 240,
    cell: ({ row }) => {
      const description = row.original.eventDescription
      if (!description) return null
      return (
        <span className="block truncate" title={description}>
          {description}
        </span>
      )
    },
    meta: { label: "Popis" },
    enableSorting: true,
  },
  {
    accessorKey: "counterpartyName",
    header: "Protistrana",
    size: 180,
    cell: ({ row }) => {
      const counterparty = row.original.counterpartyName
      if (!counterparty) return null
      return (
        <span className="block truncate" title={counterparty}>
          {counterparty}
        </span>
      )
    },
    meta: { label: "Protistrana" },
    enableSorting: true,
  },
  {
    accessorKey: "accountNumber",
    header: "Account",
    size: 180,
    cell: ({ row }) => (
      <span className="flex items-baseline gap-1.5 truncate">
        <span className="font-medium tabular-nums">
          {row.original.accountNumber}
        </span>
        {row.original.accountName ? (
          <span
            className="truncate text-muted-foreground"
            title={row.original.accountName}
          >
            {row.original.accountName}
          </span>
        ) : null}
      </span>
    ),
    meta: { label: "Account" },
    enableSorting: true,
  },
  {
    accessorKey: "side",
    header: "Side",
    size: 90,
    cell: ({ row }) => (
      <Badge variant={row.original.side === "DEBIT" ? "default" : "secondary"}>
        {row.original.side === "DEBIT" ? "MD" : "Dal"}
      </Badge>
    ),
    meta: {
      label: "Side",
      variant: "multiSelect",
      options: [
        { label: "MD (debit)", value: "DEBIT" },
        { label: "Dal (credit)", value: "CREDIT" },
      ],
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
    size: 140,
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatDecimal(row.original.amount)}
      </div>
    ),
    meta: { label: "Amount" },
    enableSorting: true,
    sortingFn: (a, b) => Number(a.original.amount) - Number(b.original.amount),
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
