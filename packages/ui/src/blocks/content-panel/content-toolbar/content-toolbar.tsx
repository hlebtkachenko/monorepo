"use client"

import { cn } from "@workspace/ui/lib/utils"

import { ContentToolbarActionButton } from "./content-toolbar-action-button"
import { ContentToolbarAddButton } from "./content-toolbar-add-button"
import { ContentToolbarFilter } from "./content-toolbar-filter"
import { ContentToolbarSearch } from "./content-toolbar-search"
import { ContentToolbarStatusFilter } from "./content-toolbar-status-filter"
import { ContentToolbarViewTools } from "./content-toolbar-view-tools"
import type { ContentToolbarProps } from "./toolbar-descriptors"

/**
 * The content panel's toolbar — page-WIDE controls, composed ONLY from the
 * closed named-data-slot vocabulary (Doc-01 §4). The container owns the fixed
 * render order: `statusFilter → search → filter … [spacer] … viewTools →
 * actions[] → add`. Every slot is a DATA descriptor, never a
 * `ReactNode`, so a page cannot inject a raw control (that hole lives only in
 * the deprecated `ContentToolbarLegacy`). The filter band (Add-filter trigger +
 * active chips + Clear) flows inline and wraps as one unit to a second row when
 * it no longer fits between the search box and the right cluster — the bar grows
 * downward instead of overlapping, and the right cluster stays on the top row.
 */
export function ContentToolbar<TData>({
  statusFilter,
  search,
  filter,
  viewTools,
  actions,
  add,
  className,
}: ContentToolbarProps<TData>) {
  const hasActiveFilters = filter != null && filter.filters.length > 0

  return (
    <div
      data-slot="content-toolbar"
      className={cn("shrink-0 border-b border-border-subtle", className)}
    >
      {/* One flex-wrap row. The right cluster is pinned to the first line
          (`order-1` + `ml-auto`). The filter band sits inline while it has no
          active chips, but once it does it takes `basis-full` (`order-2`) and
          drops to its OWN full-width line below — using the whole width instead
          of the narrow gap the right cluster leaves. `order` only reorders
          visually, so DOM + keyboard tab order stay status → search → filter →
          right cluster. `gap-y-[5px]` = 5px between wrapped lines; `py-1` adds
          the 1px top/bottom breathing room before the first / after the last. */}
      <div className="flex min-h-[42px] flex-wrap items-center gap-x-2 gap-y-[5px] px-2 py-1">
        {statusFilter ? <ContentToolbarStatusFilter {...statusFilter} /> : null}
        {search ? <ContentToolbarSearch {...search} /> : null}
        {filter ? (
          <div
            className={cn(
              "flex min-w-0 items-center",
              hasActiveFilters && "order-2 basis-full",
            )}
          >
            <ContentToolbarFilter {...filter} />
          </div>
        ) : null}
        <div className="order-1 ml-auto flex shrink-0 items-center gap-1">
          {viewTools ? <ContentToolbarViewTools {...viewTools} /> : null}
          {actions?.map((action) => (
            <ContentToolbarActionButton key={action.id} {...action} />
          ))}
          {add ? <ContentToolbarAddButton {...add} /> : null}
        </div>
      </div>
    </div>
  )
}
