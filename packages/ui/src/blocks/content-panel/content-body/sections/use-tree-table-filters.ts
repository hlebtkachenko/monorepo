"use client"

import * as React from "react"

import {
  useFilterBar,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"

import { applyTableFilters, deriveFilterColumns } from "./derive-table-filters"
import type { TableColumnSpec, TableSectionRow } from "./section-table"
import type { TreeTableRow } from "./section-tree-table"

/** Collect every node's `values` (depth-first) so the FilterBar can facet the
 *  distinct values across the WHOLE tree, not just the top tier. */
function flattenValues(
  rows: readonly TreeTableRow[],
  out: TableSectionRow[],
): void {
  for (const node of rows) {
    out.push(node.values)
    if (node.subRows && node.subRows.length > 0)
      flattenValues(node.subRows, out)
  }
}

/**
 * Narrow a tree by the active filters, keeping the hierarchy: a node survives if
 * its OWN values match OR any descendant survives (so a matching leaf keeps its
 * ancestor tiers — the same "filter from leaf rows" semantics the grid uses for
 * search). A surviving node shows only its surviving children.
 */
function filterTree(
  rows: readonly TreeTableRow[],
  filters: FiltersState,
  columns: readonly TableColumnSpec[],
): TreeTableRow[] {
  const result: TreeTableRow[] = []
  for (const node of rows) {
    const filteredKids =
      node.subRows && node.subRows.length > 0
        ? filterTree(node.subRows, filters, columns)
        : []
    const selfMatch =
      applyTableFilters([node.values], filters, columns).length > 0
    if (selfMatch || filteredKids.length > 0)
      result.push(node.subRows ? { ...node, subRows: filteredKids } : node)
  }
  return result
}

export interface UseTreeTableFiltersOptions {
  /** The section's column specs; those with a `filter` preset become filters. */
  readonly columns: readonly TableColumnSpec[]
  /** The nested tree BEFORE this filter pass (e.g. after the view-tab narrow). */
  readonly rows: readonly TreeTableRow[]
  /** Controlled active filters + setter (own it in the page for the toolbar). */
  readonly filters: FiltersState
  readonly onFiltersChange: React.Dispatch<React.SetStateAction<FiltersState>>
}

/**
 * The Tree-table counterpart to {@link useTableFilters}: it derives the same
 * column-driven toolbar filter, but facets across the flattened tree and narrows
 * the tree RECURSIVELY (keeping ancestors of a matching node) instead of a flat
 * pass. Returns the ready `filter` toolbar slot + the narrowed tree to feed
 * `sectionTreeTable`. Since the Table archetype passes a page-supplied `filter`
 * through for a non-flat body, the page wires this into `buildTableToolbar`.
 *
 * ```ts
 * const { filter, rows } = useTreeTableFilters({ columns, rows: TREE, filters, onFiltersChange })
 * // toolbar: buildTableToolbar(table, { filter })   section: sectionTreeTable({ rows })
 * ```
 */
export function useTreeTableFilters({
  columns,
  rows,
  filters,
  onFiltersChange,
}: UseTreeTableFiltersOptions) {
  const columnsConfig = React.useMemo(
    () => deriveFilterColumns(columns),
    [columns],
  )
  const data = React.useMemo(() => {
    const out: TableSectionRow[] = []
    flattenValues(rows, out)
    return out
  }, [rows])

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
    () => (filters.length === 0 ? rows : filterTree(rows, filters, columns)),
    [rows, filters, columns],
  )

  return {
    /** Spread straight into the ContentToolbar `filter` slot. */
    filter: { columns: filterColumns, filters, actions, strategy },
    /** The tree after the active filters — feed to `sectionTreeTable`. */
    rows: filteredRows,
  }
}
