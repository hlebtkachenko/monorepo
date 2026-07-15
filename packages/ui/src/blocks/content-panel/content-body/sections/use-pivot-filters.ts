"use client"

import * as React from "react"

import {
  createColumnConfigHelper,
  numberFilterFn,
  optionFilterFn,
  useFilterBar,
  type ColumnConfig,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { CircleDot, SquareSigma } from "@workspace/ui/lib/icons"

import { fieldStr } from "./pivot-transform"
import type { TableSectionRow } from "./section-table"
import type { PivotDimension, PivotMeasure } from "./section-pivot-table"

export interface UsePivotFiltersOptions {
  /** The long-format source rows the pivot folds (BEFORE this filter pass). */
  readonly rows: readonly TableSectionRow[]
  /**
   * The dimensions the pivot groups by — typically `[...rowDimensions,
   * ...columnDimensions]`. Each one becomes its OWN option filter (Region and
   * Product are two separate filters even though both live in the row-label
   * column), so the user narrows each grouping level independently.
   */
  readonly dimensions: readonly PivotDimension[]
  /**
   * The pivot's measures. Each measure with a source `field` (sum/avg/min/max —
   * not count) becomes ONE numeric toolbar filter on that field, deduped by field
   * (Amount + Avg over the same `amount` field share one filter). Filtering it
   * narrows the SOURCE rows, so the whole pivot re-folds — one "Amount" filter
   * applies across every group. A value column header's Filter opens it.
   */
  readonly measures?: readonly PivotMeasure[]
  /** Controlled active filters + setter (own it in the page for the toolbar). */
  readonly filters: FiltersState
  readonly onFiltersChange: React.Dispatch<React.SetStateAction<FiltersState>>
}

/** Distinct string values of `field` across the rows, in first-seen order. */
function distinctValues(
  rows: readonly TableSectionRow[],
  field: string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const value = fieldStr(row, field)
    if (value === "" || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * The pivot analogue of `useTableFilters`: one toolbar filter PER DIMENSION.
 * It derives an option filter for each grouping dimension (its distinct source
 * values), wires the controlled FilterBar, and returns BOTH the ready `filter`
 * toolbar slot and the source `rows` narrowed to the active selections — feed the
 * narrowed rows straight into `sectionPivotTable` and it re-folds. A pivot over
 * `[region, product]` therefore exposes a Region filter AND a Product filter,
 * each independent.
 *
 * ```ts
 * const { filter, rows } = usePivotFilters({ rows: LEDGER, dimensions: [...rowDims, ...colDims], filters, onFiltersChange: setFilters })
 * // toolbar: buildTableToolbar(table, { search, filter })   section: sectionPivotTable({ ..., rows })
 * ```
 */
export function usePivotFilters({
  rows,
  dimensions,
  measures,
  filters,
  onFiltersChange,
}: UsePivotFiltersOptions) {
  const columnsConfig = React.useMemo(() => {
    const helper = createColumnConfigHelper<TableSectionRow>()
    const configs: ColumnConfig<TableSectionRow>[] = []
    for (const dim of dimensions) {
      const options = distinctValues(rows, dim.field).map((value) => ({
        value,
        label: value,
      }))
      configs.push(
        helper
          .option()
          .id(dim.field)
          .accessor((row) => fieldStr(row, dim.field))
          .displayName(dim.label ?? dim.field)
          .icon(CircleDot)
          .options(options)
          .build() as ColumnConfig<TableSectionRow>,
      )
    }
    // One numeric filter per DISTINCT measure field (Amount + Avg share `amount`
    // → one filter). Count measures (no field) get none.
    const seenFields = new Set<string>()
    for (const measure of measures ?? []) {
      const field = measure.field
      if (!field || seenFields.has(field)) continue
      seenFields.add(field)
      configs.push(
        helper
          .number()
          .id(field)
          .accessor((row) => {
            const raw = row[field]
            return raw == null || raw === "" ? Number.NaN : Number(raw)
          })
          .displayName(measure.label)
          .icon(SquareSigma)
          .build() as ColumnConfig<TableSectionRow>,
      )
    }
    return configs
  }, [rows, dimensions, measures])

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

  const fieldById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const dim of dimensions) map.set(dim.field, dim.field)
    for (const measure of measures ?? [])
      if (measure.field) map.set(measure.field, measure.field)
    return map
  }, [dimensions, measures])

  const filteredRows = React.useMemo(() => {
    if (filters.length === 0) return [...rows]
    return rows.filter((row) =>
      filters.every((filter) => {
        // A stale filter whose dimension/measure is gone does not narrow (matches
        // the flat table's defensive apply-pass).
        const field = fieldById.get(filter.columnId)
        if (field === undefined) return true
        if (filter.type === "option")
          return optionFilterFn(
            fieldStr(row, field),
            filter as FilterModel<"option">,
          )
        if (filter.type === "number") {
          // A source row with no numeric value can't be in range → excluded by an
          // active measure filter.
          const raw = row[field]
          if (raw == null || raw === "") return false
          const n = Number(raw)
          return Number.isFinite(n)
            ? numberFilterFn(n, filter as FilterModel<"number">)
            : false
        }
        return true
      }),
    )
  }, [rows, filters, fieldById])

  return {
    /** Spread straight into the ContentToolbar `filter` slot. */
    filter: { columns: filterColumns, filters, actions, strategy },
    /** The source rows after the active dimension filters — feed to `sectionPivotTable`. */
    rows: filteredRows,
  }
}
