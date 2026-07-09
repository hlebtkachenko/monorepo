"use client"

import * as React from "react"
import type { ColumnDef, Row, Table } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { useLegislation } from "./context"
import {
  OBLIGATION_STATUS_OPTIONS,
  formatDueDate,
  type ObligationRow,
  type ObligationStatus,
} from "./data"
import { ObligationTitle } from "./obligation-title"

const STATUS_BADGE: Record<
  ObligationStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  Upcoming: "outline",
  "Due soon": "secondary",
}

// Anchor for shift-range selection across the visible page (row id).
const selectAnchorId: { current: string | null } = { current: null }

function SelectCell({
  row,
  table,
}: {
  row: Row<ObligationRow>
  table: Table<ObligationRow>
}) {
  const checked = row.getIsSelected()
  return (
    <Checkbox
      aria-label={`Select ${row.original.obligation} for ${row.original.company}`}
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

/** Row affordance that opens the obligation Inspector. */
function InspectCell({ row }: { row: ObligationRow }) {
  const { openInspector } = useLegislation()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Details for ${row.obligation} · ${row.company}`}
      onClick={() => openInspector(row)}
    >
      <Icon />
    </Button>
  )
}

export const obligationColumns: ColumnDef<ObligationRow>[] = [
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
    cell: ({ row, table }) => <SelectCell row={row} table={table} />,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: "obligation",
    header: "Obligation",
    size: 220,
    cell: ({ row }) => (
      <ObligationTitle
        obligation={row.original.obligation}
        conditional={row.original.conditional}
        note={row.original.note}
      />
    ),
    meta: { label: "Obligation" },
    enableSorting: true,
  },
  {
    accessorKey: "company",
    header: "Company",
    size: 220,
    meta: { label: "Company" },
    enableSorting: true,
  },
  {
    accessorKey: "dueDate",
    header: "Due date",
    size: 140,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDueDate(row.original.dueDate)}
      </span>
    ),
    meta: { label: "Due date" },
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 130,
    cell: ({ row }) => (
      <Badge variant={STATUS_BADGE[row.original.status]}>
        {row.original.status}
      </Badge>
    ),
    meta: {
      label: "Status",
      variant: "multiSelect",
      options: OBLIGATION_STATUS_OPTIONS,
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    id: "assignee",
    accessorFn: (row) => row.assignee ?? "",
    header: "Assigned",
    size: 160,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.assignee ?? "Unassigned"}
      </span>
    ),
    meta: { label: "Assigned" },
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
