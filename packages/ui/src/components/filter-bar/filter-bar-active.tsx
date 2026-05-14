"use client"

import * as React from "react"
import { X } from "@workspace/ui/lib/icons"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { getColumn } from "./filter-bar-helpers"
import { FilterOperator } from "./filter-bar-operator"
import { FilterValue } from "./filter-bar-value"
import type {
  Column,
  ColumnDataType,
  DataTableFilterActions,
  FilterBarStrings,
  FilterModel,
  FilterStrategy,
  FiltersState,
} from "./filter-bar-types"
import { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"

interface ActiveFiltersProps<TData> {
  columns: Column<TData>[]
  filters: FiltersState
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: FilterBarStrings
}

export function ActiveFilters<TData>({
  columns,
  filters,
  actions,
  strategy,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: ActiveFiltersProps<TData>) {
  return (
    <>
      {filters.map((filter) => {
        const id = filter.columnId
        const column = getColumn(columns, id)
        if (!filter.values) return null

        return (
          <ActiveFilter
            key={`active-filter-${filter.columnId}`}
            filter={filter}
            column={column}
            actions={actions}
            strategy={strategy}
            strings={strings}
          />
        )
      })}
    </>
  )
}

interface ActiveFilterProps<TData, TType extends ColumnDataType> {
  filter: FilterModel<TType>
  column: Column<TData, TType>
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: FilterBarStrings
}

function FilterSubject<TData, TType extends ColumnDataType>({
  column,
}: {
  column: Column<TData, TType>
}) {
  const hasIcon = !!column.icon
  const iconStyle = column.iconColor ? { color: column.iconColor } : undefined
  return (
    <span className="flex items-center gap-1 px-2 font-medium whitespace-nowrap select-none">
      {hasIcon && (
        <span
          data-slot="filter-bar-pill-icon"
          className="flex items-center"
          style={iconStyle}
        >
          <column.icon className="size-4 stroke-[2.25px]" />
        </span>
      )}
      <span className="text-muted-foreground">{column.displayName}</span>
    </span>
  )
}

export function ActiveFilter<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  strategy,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: ActiveFilterProps<TData, TType>) {
  return (
    <div
      data-slot="filter-bar-pill"
      className="flex h-7 items-center rounded-2xl border border-border bg-background text-xs text-foreground shadow-xs"
    >
      <FilterSubject column={column} />
      <Separator orientation="vertical" />
      <FilterOperator
        filter={filter}
        column={column}
        actions={actions}
        strings={strings}
      />
      <Separator orientation="vertical" />
      <FilterValue
        filter={filter}
        column={column}
        actions={actions}
        strategy={strategy}
        strings={strings}
      />
      <Separator orientation="vertical" />
      <Button
        variant="ghost"
        aria-label="Remove filter"
        className="h-full w-7 rounded-none rounded-r-2xl text-xs"
        onClick={() => actions.removeFilter(filter.columnId)}
      >
        <X className="size-4 -translate-x-0.5" />
      </Button>
    </div>
  )
}

export function ActiveFiltersMobileContainer({
  children,
}: {
  children: React.ReactNode
}) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [showLeftBlur, setShowLeftBlur] = React.useState(false)
  const [showRightBlur, setShowRightBlur] = React.useState(true)

  const checkScroll = React.useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current
      setShowLeftBlur(scrollLeft > 0)
      setShowRightBlur(scrollLeft + clientWidth < scrollWidth - 1)
    }
  }, [])

  React.useEffect(() => {
    const node = scrollContainerRef.current
    if (node) {
      const resizeObserver = new ResizeObserver(() => checkScroll())
      resizeObserver.observe(node)
      return () => resizeObserver.disconnect()
    }
  }, [checkScroll])

  React.useEffect(() => {
    checkScroll()
  }, [children, checkScroll])

  return (
    <div
      data-slot="filter-bar-active"
      className="relative w-full overflow-x-hidden"
    >
      {showLeftBlur && (
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 animate-in bg-gradient-to-r from-background to-transparent fade-in-0" />
      )}
      <div
        ref={scrollContainerRef}
        className="no-scrollbar flex gap-2 overflow-x-scroll"
        onScroll={checkScroll}
      >
        {children}
      </div>
      {showRightBlur && (
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-16 animate-in bg-gradient-to-l from-background to-transparent fade-in-0" />
      )}
    </div>
  )
}
