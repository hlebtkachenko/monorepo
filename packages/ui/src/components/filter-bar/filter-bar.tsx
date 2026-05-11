"use client"

import * as React from "react"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import {
  ActiveFilters,
  ActiveFiltersMobileContainer,
} from "./filter-bar-active"
import { FilterActions } from "./filter-bar-actions"
import { FilterSelector } from "./filter-bar-selector"
import type {
  Column,
  DataTableFilterActions,
  FilterBarStrings,
  FilterStrategy,
  FiltersState,
} from "./filter-bar-types"
import { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"

export interface FilterBarProps<TData> {
  columns: Column<TData>[]
  filters: FiltersState
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: Partial<FilterBarStrings>
}

export function FilterBar<TData>({
  columns,
  filters,
  actions,
  strategy,
  strings,
}: FilterBarProps<TData>) {
  const isMobile = useIsMobile()

  const mergedStrings: FilterBarStrings = React.useMemo(
    () => ({
      ...FILTER_BAR_DEFAULT_STRINGS,
      ...strings,
      operatorLabels: {
        ...FILTER_BAR_DEFAULT_STRINGS.operatorLabels,
        ...(strings?.operatorLabels ?? {}),
      },
    }),
    [strings],
  )

  if (isMobile) {
    return (
      <div
        data-slot="filter-bar"
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
      data-slot="filter-bar"
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

export { useFilterBar } from "./use-filter-bar"
export { createColumnConfigHelper } from "./filter-bar-core"
export {
  optionFilterFn,
  multiOptionFilterFn,
  dateFilterFn,
  textFilterFn,
  numberFilterFn,
} from "./filter-bar-core"
export { ActiveFilters, ActiveFilter } from "./filter-bar-active"
export { FilterActions } from "./filter-bar-actions"
export { FilterSelector } from "./filter-bar-selector"
export { FilterOperator } from "./filter-bar-operator"
export { FilterValue } from "./filter-bar-value"
export { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"
export type {
  Column,
  ColumnConfig,
  ColumnDataType,
  ColumnOption,
  DataTableFilterActions,
  FilterBarStrings,
  FilterModel,
  FilterStrategy,
  FiltersState,
  FilterValues,
  FilterOperators,
} from "./filter-bar-types"
