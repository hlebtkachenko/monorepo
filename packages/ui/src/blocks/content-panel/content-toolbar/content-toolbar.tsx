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
  return (
    <div
      data-slot="content-toolbar"
      className={cn("shrink-0 border-b border-border-subtle", className)}
    >
      {/* The left cluster (status → search → filter) takes the remaining width
          and wraps INTERNALLY only when its own content no longer fits — so the
          filter band stays inline next to search while there is room and drops
          to a second line just when it must. The right cluster is `shrink-0`
          and stays on the first line (`items-start`). DOM + keyboard order stay
          status → search → filter → right cluster. `gap-y-[5px]` = 5px between
          wrapped lines. */}
      <div className="flex min-h-[42px] items-start gap-x-2 px-2 py-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-[5px]">
          {statusFilter ? (
            <ContentToolbarStatusFilter {...statusFilter} />
          ) : null}
          {search ? <ContentToolbarSearch {...search} /> : null}
          {filter ? (
            <div className="flex min-w-0 items-center">
              <ContentToolbarFilter {...filter} />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
