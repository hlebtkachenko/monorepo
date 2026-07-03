"use client"

import Link from "next/link"
import type { ColumnDef, Row, Table } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { useIcons } from "@workspace/ui/icon-packs"

import { useCompanies } from "./context"
import { COMPANY_STATUS_OPTIONS, STATUS_BADGE, type CompanyRow } from "./data"

// Anchor for shift-range selection across the visible page (row id).
const selectAnchorId: { current: string | null } = { current: null }

function SelectCell({
  row,
  table,
}: {
  row: Row<CompanyRow>
  table: Table<CompanyRow>
}) {
  const checked = row.getIsSelected()
  return (
    <Checkbox
      aria-label={`Select ${row.original.legalName}`}
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

/** Row affordance that opens the company Inspector. */
function InspectCell({ row }: { row: CompanyRow }) {
  const { openInspector } = useCompanies()
  const icons = useIcons()
  const Icon = icons.PanelRight
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Details for ${row.legalName}`}
      onClick={() => openInspector(row)}
    >
      <Icon />
    </Button>
  )
}

/** "Open" — navigate into the company's organization surface. */
function OpenBookCell({ slug }: { slug: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-7">
      <Link href={`/${slug}`}>Open</Link>
    </Button>
  )
}

export const companyColumns: ColumnDef<CompanyRow>[] = [
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
    accessorKey: "legalName",
    header: "Company",
    size: 240,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.legalName}</span>
    ),
    meta: { label: "Company" },
    enableSorting: true,
  },
  {
    accessorKey: "typeLabel",
    header: "Type",
    size: 120,
    meta: { label: "Type" },
    enableSorting: true,
  },
  {
    accessorKey: "vatRegime",
    header: "VAT regime",
    size: 150,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.vatRegime}</span>
    ),
    meta: { label: "VAT regime" },
    enableSorting: true,
  },
  {
    accessorKey: "fiscalYear",
    header: "Fiscal year",
    size: 130,
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.fiscalYear}</span>
    ),
    meta: { label: "Fiscal year" },
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
      options: COMPANY_STATUS_OPTIONS,
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    accessorKey: "nextDeadline",
    header: "Next deadline",
    size: 180,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.nextDeadline}</span>
    ),
    meta: { label: "Next deadline" },
  },
  {
    accessorKey: "assignee",
    header: "Assigned",
    size: 160,
    meta: { label: "Assigned" },
    enableSorting: true,
  },
  {
    id: "open",
    size: 110,
    minSize: 110,
    maxSize: 110,
    meta: { align: "center" },
    cell: ({ row }) => <OpenBookCell slug={row.original.slug} />,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
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
