"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { DataTablePagination } from "@workspace/ui/components/data-table"

/**
 * The one workspace-tier status bar for `useDataTable` pages — count (+ Filtered
 * badge) on the left, the real `DataTablePagination` on the right, in the 36px
 * band the table archetype uses (the 24px `ContentStatusBar` is too short for a
 * pager). Replaces the hand-rolled count-only bars in Companies + Legislation
 * that shipped no pager (rows past the page size were unreachable) and never
 * published `--app-statusbar-clearance` (so the floating `ActionBar` overlapped
 * them). This publishes the clearance the same way the table demo does, so the
 * ActionBar + toasts clear the bar.
 */
export function TableStatusBar<TData>({
  table,
  noun,
  nounPlural,
  isFiltered = false,
}: {
  table: Table<TData>
  /** Singular row noun, e.g. "company". */
  noun: string
  /** Plural form when the naive `${noun}s` is wrong (e.g. "companies"). */
  nounPlural?: string
  isFiltered?: boolean
}) {
  const count = table.getFilteredRowModel().rows.length
  const plural = nounPlural ?? `${noun}s`

  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      "--app-statusbar-clearance",
      "calc(var(--shell-bottom-inset) + 36px + 8px)",
    )
    return () => {
      root.style.removeProperty("--app-statusbar-clearance")
    }
  }, [])

  return (
    <div
      data-slot="table-status-bar"
      className="flex h-9 shrink-0 items-center gap-4 border-t border-border-subtle px-2 text-xs text-muted-foreground"
    >
      <div className="flex items-center gap-1.5">
        <span>
          {count} {count === 1 ? noun : plural}
        </span>
        {isFiltered ? (
          <Badge variant="secondary" className="h-5">
            Filtered
          </Badge>
        ) : null}
      </div>
      <div className="ml-auto">
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}
