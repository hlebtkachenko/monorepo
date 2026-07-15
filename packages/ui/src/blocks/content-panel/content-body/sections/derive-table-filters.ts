import {
  createColumnConfigHelper,
  dateFilterFn,
  multiOptionFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  type ColumnConfig,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import {
  BaselineIcon,
  Calculator,
  CalendarIcon,
  ListChecksIcon,
  ListIcon,
} from "@workspace/ui/lib/icons"

import type {
  TableColumnFilterVariant,
  TableColumnSpec,
  TableSectionRow,
} from "./section-table"

/**
 * Column-driven toolbar filters. A column spec declares a `filter` PRESET
 * (`{ variant }`); the toolbar's multi-filter config (`deriveFilterColumns`) and
 * the row apply-pass (`applyTableFilters`) are both derived from those specs, so
 * a page never hand-writes a `createColumnConfigHelper` chain or a per-column
 * `matchesFilters`. Two columns of the same variant reuse the same filter UI;
 * each just supplies its own `header` as the label. See `docs/specs/TABLE-FILTERS.md`.
 */

/** Default filter icon per preset variant (a column may still carry its own). */
const VARIANT_ICON: Record<TableColumnFilterVariant, typeof BaselineIcon> = {
  text: BaselineIcon,
  number: Calculator,
  date: CalendarIcon,
  option: ListIcon,
  multiOption: ListChecksIcon,
}

/** A comma-joined tag cell → the string[] the multiOption filter expects. */
function toTags(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .filter(Boolean)
}

/**
 * Build the bazza FilterBar `columnsConfig` from the columns that declare a
 * `filter` preset. Accessors read each cell from the row record by column id and
 * coerce it to the shape the preset expects; option values default to the
 * column's own `options`.
 */
export function deriveFilterColumns(
  columns: readonly TableColumnSpec[],
): ColumnConfig<TableSectionRow>[] {
  const helper = createColumnConfigHelper<TableSectionRow>()
  const configs: ColumnConfig<TableSectionRow>[] = []
  for (const col of columns) {
    if (!col.filter) continue
    const label = col.header
    const icon = VARIANT_ICON[col.filter.variant]
    const options = (col.filter.options ?? col.options)?.map((o) => ({
      value: o.value,
      label: o.label,
    }))
    switch (col.filter.variant) {
      case "text":
        configs.push(
          helper
            .text()
            .id(col.id)
            .accessor((row) => String(row[col.id] ?? ""))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "number":
        configs.push(
          helper
            .number()
            .id(col.id)
            .accessor((row) => Number(row[col.id] ?? 0))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "date":
        configs.push(
          helper
            .date()
            .id(col.id)
            .accessor((row) => new Date(String(row[col.id] ?? "")))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "option":
        configs.push(
          helper
            .option()
            .id(col.id)
            .accessor((row) => String(row[col.id] ?? ""))
            .displayName(label)
            .icon(icon)
            .options(options ?? [])
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "multiOption":
        configs.push(
          helper
            .multiOption()
            .id(col.id)
            .accessor((row) => toTags(row[col.id]))
            .displayName(label)
            .icon(icon)
            .options(options ?? [])
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
    }
  }
  return configs
}

/**
 * Apply an active `FiltersState` to the rows (the client pre-filter the page
 * feeds the section as its `rows`). Each filter is dispatched to the preset
 * `filterFn` for its column's variant — derived from the same specs, so it stays
 * in lockstep with `deriveFilterColumns`.
 */
export function applyTableFilters(
  rows: readonly TableSectionRow[],
  filters: FiltersState,
  columns: readonly TableColumnSpec[],
): TableSectionRow[] {
  if (filters.length === 0) return [...rows]
  const variantById = new Map<string, TableColumnFilterVariant>()
  for (const col of columns) {
    if (col.filter) variantById.set(col.id, col.filter.variant)
  }
  return rows.filter((row) =>
    filters.every((filter) => {
      const raw = row[filter.columnId]
      switch (variantById.get(filter.columnId)) {
        case "text":
          return textFilterFn(String(raw ?? ""), filter as FilterModel<"text">)
        case "number":
          return numberFilterFn(
            Number(raw ?? 0),
            filter as FilterModel<"number">,
          )
        case "date":
          return dateFilterFn(
            new Date(String(raw ?? "")),
            filter as FilterModel<"date">,
          )
        case "option":
          return optionFilterFn(
            String(raw ?? ""),
            filter as FilterModel<"option">,
          )
        case "multiOption":
          return multiOptionFilterFn(
            toTags(raw),
            filter as FilterModel<"multiOption">,
          )
        default:
          // A filter targeting a column with no preset does not narrow.
          return true
      }
    }),
  )
}
