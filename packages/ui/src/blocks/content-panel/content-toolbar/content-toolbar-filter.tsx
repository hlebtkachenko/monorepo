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
 * The toolbar filter band (left #3) — the active filter chips, the "Add filter"
 * selector, and the Clear action, all in ONE inline flex-wrap group. The active
 * chips lead; the "Add filter" trigger TRAILS them, so as chips fill the line the
 * trigger flows onto the next line together with the overflow chips (it is not
 * pinned to the front). The whole band still wraps as a unit when it no longer
 * fits between the search box and the toolbar's right cluster. Default-size
 * trigger, design-system tokens — no separate always-open band.
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
      <ActiveFilters
        columns={columns}
        filters={filters}
        actions={actions}
        strategy={strategy}
        strings={TOOLBAR_FILTER_STRINGS}
      />
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
      <FilterActions
        hasFilters={filters.length > 0}
        actions={actions}
        strings={TOOLBAR_FILTER_STRINGS}
      />
    </div>
  )
}
