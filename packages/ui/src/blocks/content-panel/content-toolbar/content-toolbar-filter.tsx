"use client"

import {
  ActiveFilters,
  FilterActions,
  FilterSelector,
} from "@workspace/ui/components/filter-bar"

import type { FilterDescriptor } from "./toolbar-descriptors"

/**
 * The in-bar filter control (left #3) — ONLY the funnel selector. The active
 * chips + Clear live in a distinct band below the bar and render through
 * {@link ContentToolbarFilterActiveBand}, which the container places.
 */
export function ContentToolbarFilter<TData>({
  columns,
  filters,
  actions,
  strategy,
  open,
  onOpenChange,
  property,
  onPropertyChange,
}: FilterDescriptor<TData>) {
  return (
    <FilterSelector
      columns={columns}
      filters={filters}
      actions={actions}
      strategy={strategy}
      open={open}
      onOpenChange={onOpenChange}
      property={property}
      onPropertyChange={onPropertyChange}
    />
  )
}

/**
 * The filter band below the bar — the active-filter chips + Clear. The
 * container owns the band's wrapper (it only mounts it when filters exist), so
 * this wrapper renders just the two filter-bar primitives.
 */
export function ContentToolbarFilterActiveBand<TData>({
  columns,
  filters,
  actions,
  strategy,
}: FilterDescriptor<TData>) {
  return (
    <>
      <ActiveFilters
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
      />
      <FilterActions hasFilters={filters.length > 0} actions={actions} />
    </>
  )
}
