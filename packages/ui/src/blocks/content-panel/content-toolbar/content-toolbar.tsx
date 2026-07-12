"use client"

import { cn } from "@workspace/ui/lib/utils"

import { ContentToolbarActionButton } from "./content-toolbar-action-button"
import { ContentToolbarAddButton } from "./content-toolbar-add-button"
import {
  ContentToolbarFilter,
  ContentToolbarFilterActiveBand,
} from "./content-toolbar-filter"
import { ContentToolbarModeToggle } from "./content-toolbar-mode-toggle"
import { ContentToolbarSearch } from "./content-toolbar-search"
import { ContentToolbarStatusFilter } from "./content-toolbar-status-filter"
import { ContentToolbarViewTools } from "./content-toolbar-view-tools"
import type { ContentToolbarProps } from "./toolbar-descriptors"

/**
 * The content panel's toolbar — page-WIDE controls, composed ONLY from the
 * closed named-data-slot vocabulary (Doc-01 §4). The container owns the fixed
 * render order: `statusFilter → search → filter … [spacer] … viewTools →
 * actions[] → add → modeToggle`. Every slot is a DATA descriptor, never a
 * `ReactNode`, so a page cannot inject a raw control (that hole lives only in
 * the deprecated `ContentToolbarLegacy`). The active-filters chips render in a
 * distinct band BELOW the 36px bar, so the bar height never jumps.
 */
export function ContentToolbar<TData>({
  statusFilter,
  search,
  filter,
  viewTools,
  actions,
  add,
  modeToggle,
  className,
}: ContentToolbarProps<TData>) {
  const hasActiveFilters = filter != null && filter.filters.length > 0

  return (
    <div
      data-slot="content-toolbar"
      className={cn("shrink-0 border-b border-border-subtle", className)}
    >
      <div className="flex min-h-9 items-center gap-2 px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {statusFilter ? (
            <ContentToolbarStatusFilter {...statusFilter} />
          ) : null}
          {search ? <ContentToolbarSearch {...search} /> : null}
          {filter ? <ContentToolbarFilter {...filter} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 py-px">
          {viewTools ? <ContentToolbarViewTools {...viewTools} /> : null}
          {actions?.map((action) => (
            <ContentToolbarActionButton key={action.id} {...action} />
          ))}
          {add ? <ContentToolbarAddButton {...add} /> : null}
          {modeToggle ? <ContentToolbarModeToggle {...modeToggle} /> : null}
        </div>
      </div>
      {hasActiveFilters ? (
        <div
          data-slot="content-toolbar-filter-band"
          className="flex flex-wrap items-center gap-1.5 px-2 pb-1"
        >
          <ContentToolbarFilterActiveBand {...filter} />
        </div>
      ) : null}
    </div>
  )
}
