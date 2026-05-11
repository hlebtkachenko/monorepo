"use client"

import * as React from "react"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import {
  ActiveFilters,
  ActiveFiltersMobileContainer,
} from "./data-table-filter-active"
import { FilterActions } from "./data-table-filter-actions"
import { FilterSelector } from "./data-table-filter-selector"
import type {
  Column,
  DataTableFilterActions,
  DataTableFilterStrings,
  FilterStrategy,
  FiltersState,
} from "./data-table-filter-types"
import { DEFAULT_STRINGS } from "./data-table-filter-types"

export interface DataTableFilterProps<TData> {
  columns: Column<TData>[]
  filters: FiltersState
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: Partial<DataTableFilterStrings>
}

export function DataTableFilter<TData>({
  columns,
  filters,
  actions,
  strategy,
  strings,
}: DataTableFilterProps<TData>) {
  const isMobile = useIsMobile()

  const mergedStrings: DataTableFilterStrings = React.useMemo(
    () => ({
      ...DEFAULT_STRINGS,
      ...strings,
      operatorLabels: {
        ...DEFAULT_STRINGS.operatorLabels,
        ...(strings?.operatorLabels ?? {}),
      },
    }),
    [strings],
  )

  if (isMobile) {
    return (
      <div
        data-slot="data-table-filter"
        className="flex w-full items-start justify-between gap-2"
      >
        <div className="flex gap-1">
          <FilterSelector
            columns={columns}
            filters={filters}
            actions={actions}
            strategy={strategy}
            strings={mergedStrings}
          />
          <FilterActions
            hasFilters={filters.length > 0}
            actions={actions}
            strings={mergedStrings}
          />
        </div>
        <ActiveFiltersMobileContainer>
          <ActiveFilters
            columns={columns}
            filters={filters}
            actions={actions}
            strategy={strategy}
            strings={mergedStrings}
          />
        </ActiveFiltersMobileContainer>
      </div>
    )
  }

  return (
    <div
      data-slot="data-table-filter"
      className="flex w-full items-start justify-between gap-2"
    >
      <div className="flex w-full flex-1 gap-2 md:flex-wrap">
        <FilterSelector
          columns={columns}
          filters={filters}
          actions={actions}
          strategy={strategy}
          strings={mergedStrings}
        />
        <ActiveFilters
          columns={columns}
          filters={filters}
          actions={actions}
          strategy={strategy}
          strings={mergedStrings}
        />
      </div>
      <FilterActions
        hasFilters={filters.length > 0}
        actions={actions}
        strings={mergedStrings}
      />
    </div>
  )
}

export { useDataTableFilters } from "./use-data-table-filters"
export { createColumnConfigHelper } from "./data-table-filter-core"
export {
  optionFilterFn,
  multiOptionFilterFn,
  dateFilterFn,
  textFilterFn,
  numberFilterFn,
} from "./data-table-filter-core"
export { ActiveFilters, ActiveFilter } from "./data-table-filter-active"
export { FilterActions } from "./data-table-filter-actions"
export { FilterSelector } from "./data-table-filter-selector"
export { FilterOperator } from "./data-table-filter-operator"
export { FilterValue } from "./data-table-filter-value"
export { DEFAULT_STRINGS } from "./data-table-filter-types"
export type {
  Column,
  ColumnConfig,
  ColumnDataType,
  ColumnOption,
  DataTableFilterActions,
  DataTableFilterStrings,
  FilterModel,
  FilterStrategy,
  FiltersState,
  FilterValues,
  FilterOperators,
} from "./data-table-filter-types"
