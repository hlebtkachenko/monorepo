import {
  dateFilterFn,
  multiOptionFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"

/** The minimal column shape the client-side filter pass needs. */
export interface FilterColumnLike<T> {
  id: string
  accessor: (row: T) => unknown
}

/**
 * Apply a FilterBar `FiltersState` to a row set, client-side. Shared by every
 * surface that drives a FilterBar without a server query (the content-panel demo
 * table and the dashboard ledger), so the filter semantics stay in one place.
 */
export function applyFilterBar<T>(
  rows: T[],
  filters: FiltersState,
  config: FilterColumnLike<T>[],
): T[] {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => {
      const column = config.find((c) => c.id === filter.columnId)
      if (!column) return true
      const value = column.accessor(row)
      switch (filter.type) {
        case "number":
          return numberFilterFn(
            value as number,
            filter as FilterModel<"number">,
          )
        case "date":
          return dateFilterFn(value as Date, filter as FilterModel<"date">)
        case "text":
          return textFilterFn(value as string, filter as FilterModel<"text">)
        case "option":
          return optionFilterFn(
            value as string,
            filter as FilterModel<"option">,
          )
        case "multiOption":
          return multiOptionFilterFn(
            value as string[],
            filter as FilterModel<"multiOption">,
          )
        default:
          return true
      }
    }),
  )
}
