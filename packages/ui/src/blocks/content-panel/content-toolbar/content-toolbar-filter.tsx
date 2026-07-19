"use client"

import {
  ActiveFilters,
  FILTER_BAR_DEFAULT_STRINGS,
  FilterActions,
  FilterSelector,
} from "@workspace/ui/components/filter-bar"

import type { FilterDescriptor } from "./toolbar-descriptors"

// The ContentToolbar labels its filter entry "Add filter" (vs the standalone
// bar's "Filter") and keeps that label visible even once filters are applied.
const TOOLBAR_FILTER_STRINGS = {
  ...FILTER_BAR_DEFAULT_STRINGS,
  filter: "Add filter",
}

/**
 * The toolbar filter band (left #3) — the "Add filter" selector, the active
 * filter chips, and the Clear action, all in ONE inline flex-wrap group. The
 * whole band wraps to the next line as a unit when it no longer fits between the
 * search box and the toolbar's right cluster; the chips then wrap within it.
 * Default-size trigger, design-system tokens — no separate always-open band.
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
    <div
      data-slot="content-toolbar-filter"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      <FilterSelector
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
        strings={TOOLBAR_FILTER_STRINGS}
        open={open}
        onOpenChange={onOpenChange}
        property={property}
        onPropertyChange={onPropertyChange}
        size="default"
        alwaysShowLabel
      />
      <ActiveFilters
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
        strings={TOOLBAR_FILTER_STRINGS}
      />
      <FilterActions
        hasFilters={filters.length > 0}
        actions={actions}
        strings={TOOLBAR_FILTER_STRINGS}
      />
    </div>
  )
}
