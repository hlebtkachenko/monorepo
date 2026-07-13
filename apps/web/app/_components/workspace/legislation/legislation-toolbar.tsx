"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbarLegacy } from "@workspace/ui/blocks/content-panel"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"

import { ToolbarSearch } from "../_shared/toolbar-search"
import { OBLIGATION_STATUS_OPTIONS, type ObligationRow } from "./data"

export interface LegislationToolbarProps {
  table: Table<ObligationRow>
  statusOpen: boolean
  onStatusOpenChange: (open: boolean) => void
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Legislation toolbar — Left: a faceted Status filter + a universal search.
 * Right: the column manager and multi-sort. No "Add" action — obligations are
 * derived from company books, not manually created here.
 */
export function LegislationToolbar({
  table,
  statusOpen,
  onStatusOpenChange,
  search,
  onSearchChange,
}: LegislationToolbarProps) {
  const statusColumn = table.getColumn("status")

  return (
    <ContentToolbarLegacy
      left={
        <>
          {statusColumn ? (
            <DataTableFacetedFilter
              column={statusColumn}
              title="Status"
              options={OBLIGATION_STATUS_OPTIONS}
              multiple
              open={statusOpen}
              onOpenChange={onStatusOpenChange}
            />
          ) : null}
          <ToolbarSearch
            value={search}
            onChange={onSearchChange}
            placeholder="Search obligations…"
          />
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
