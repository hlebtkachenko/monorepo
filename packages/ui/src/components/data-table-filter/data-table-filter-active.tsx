"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { getColumn } from "./data-table-filter-helpers"
import { FilterOperator } from "./data-table-filter-operator"
import { FilterValue } from "./data-table-filter-value"
import type {
  Column,
  ColumnDataType,
  DataTableFilterActions,
  DataTableFilterStrings,
  FilterModel,
  FilterStrategy,
  FiltersState,
} from "./data-table-filter-types"
import { DEFAULT_STRINGS } from "./data-table-filter-types"

interface ActiveFiltersProps<TData> {
  columns: Column<TData>[]
  filters: FiltersState
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: DataTableFilterStrings
}

export function ActiveFilters<TData>({
  columns,
  filters,
  actions,
  strategy,
  strings = DEFAULT_STRINGS,
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
  strings?: DataTableFilterStrings
}

function FilterSubject<TData, TType extends ColumnDataType>({
  column,
}: {
  column: Column<TData, TType>
}) {
  const hasIcon = !!column.icon
  return (
    <span className="flex items-center gap-1 px-2 font-medium whitespace-nowrap select-none">
      {hasIcon && <column.icon className="size-4 stroke-[2.25px]" />}
      <span>{column.displayName}</span>
    </span>
  )
}

export function ActiveFilter<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  strategy,
  strings = DEFAULT_STRINGS,
}: ActiveFilterProps<TData, TType>) {
  return (
    <div
      data-slot="data-table-filter-pill"
      className="flex h-7 items-center rounded-2xl border border-border bg-secondary text-xs text-secondary-foreground shadow-xs"
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
      data-slot="data-table-filter-active"
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
