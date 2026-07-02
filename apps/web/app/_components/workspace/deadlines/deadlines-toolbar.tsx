"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/app-content"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { Search } from "@workspace/ui/lib/icons"

import { DEADLINE_STATUS_OPTIONS, type DeadlineRow } from "./data"

export interface DeadlinesToolbarProps {
  table: Table<DeadlineRow>
  statusOpen: boolean
  onStatusOpenChange: (open: boolean) => void
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Deadlines toolbar — Left: a faceted Status filter + a universal search.
 * Right: the column manager and multi-sort. No "Add" action — obligations are
 * derived from client books, not manually created here.
 */
export function DeadlinesToolbar({
  table,
  statusOpen,
  onStatusOpenChange,
  search,
  onSearchChange,
}: DeadlinesToolbarProps) {
  const statusColumn = table.getColumn("status")

  return (
    <ContentToolbar
      left={
        <>
          {statusColumn ? (
            <DataTableFacetedFilter
              column={statusColumn}
              title="Status"
              options={DEADLINE_STATUS_OPTIONS}
              multiple
              open={statusOpen}
              onOpenChange={onStatusOpenChange}
            />
          ) : null}
          <div className="relative flex h-7 w-72 items-center">
            <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
            <Input
              placeholder="Search deadlines…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-7 w-full pl-8"
            />
          </div>
        </>
      }
      right={
        <>
          <DataTableColumnManager table={table} />
          <DataTableMultiSort table={table} />
        </>
      }
    />
  )
}
