import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { EmptyState } from "./empty-state"

export interface ColumnDef {
  key: string
  label: string
  align?: "left" | "right" | "center"
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

function renderCell(col: ColumnDef, row: Record<string, unknown>): ReactNode {
  const value = row[col.key]
  if (col.render) return col.render(value, row)
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export interface DataTableProps {
  columns: ColumnDef[]
  rows: Array<Record<string, unknown>>
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

/**
 * The admin standard table look: a card-wrapped table with a muted, uppercase
 * sticky-friendly header and hover rows. This is the single source of the
 * "normal" admin table — `DataTablePage` wraps it with page chrome (toolbar +
 * footer), detail pages embed it directly. Cell content comes from each
 * column's optional `render`.
 */
export function DataTable({
  columns,
  rows,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Try adjusting filters.",
  className,
}: DataTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle",
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-muted/40">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
                  alignClass[c.align ?? "left"],
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={String(row.id ?? idx)}
              className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-muted/30"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-3 py-2.5", alignClass[c.align ?? "left"])}
                >
                  {renderCell(c, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
