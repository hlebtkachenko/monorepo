"use client"

import * as React from "react"

import {
  useFilterBar,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"

import { applyTableFilters, deriveFilterColumns } from "./derive-table-filters"
import type { TableColumnSpec, TableSectionRow } from "./section-table"

export interface UseTableFiltersOptions {
  /** The section's column specs; those with a `filter` preset become filters. */
  readonly columns: readonly TableColumnSpec[]
  /** The full row set BEFORE this filter pass (e.g. after the view-tab narrow). */
  readonly rows: readonly TableSectionRow[]
  /** Controlled active filters + setter (own it in the page for the toolbar).
   * Typically `const [filters, setFilters] = React.useState<FiltersState>([])`. */
  readonly filters: FiltersState
  readonly onFiltersChange: React.Dispatch<React.SetStateAction<FiltersState>>
}

/**
 * The one call a page makes to get column-driven toolbar filters. It derives the
 * FilterBar config from the column specs' `filter` presets, wires the controlled
 * FilterBar state, and returns BOTH the ready `filter` toolbar slot and the
 * pre-filtered `rows` to feed the section — collapsing the per-page
 * `createColumnConfigHelper` chain + hand-written `matchesFilters` to one line.
 *
 * ```ts
 * const { filter, rows } = useTableFilters({ columns: COLUMNS, rows: base, filters, onFiltersChange: setFilters })
 * // toolbar: { ..., filter }   section: sectionTable({ ..., rows })
 * ```
 */
export function useTableFilters({
  columns,
  rows,
  filters,
  onFiltersChange,
}: UseTableFiltersOptions) {
  const columnsConfig = React.useMemo(
    () => deriveFilterColumns(columns),
    [columns],
  )
  const data = React.useMemo(() => [...rows], [rows])

  const {
    columns: filterColumns,
    actions,
    strategy,
  } = useFilterBar({
    strategy: "client" as const,
    data,
    columnsConfig,
    filters,
    onFiltersChange,
  })

  const filteredRows = React.useMemo(
    () => applyTableFilters(rows, filters, columns),
    [rows, filters, columns],
  )

  return {
    /** Spread straight into the ContentToolbar `filter` slot. */
    filter: { columns: filterColumns, filters, actions, strategy },
    /** The section rows after the active filters — feed to `sectionTable`. */
    rows: filteredRows,
  }
}
