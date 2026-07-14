"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import type {
  DataTableFilterActions,
  FilterBarStrings,
} from "./filter-bar-types"
import { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"

interface FilterActionsProps {
  hasFilters: boolean
  actions?: DataTableFilterActions
  strings?: FilterBarStrings
}

function FilterActionsImpl({
  hasFilters,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterActionsProps) {
  // Chip-matched: same h-7 pill + border as the active-filter chips, normal
  // (foreground) label, destructive red on hover — mirrors the search clear (X)
  // affordance. No icon, no shadow.
  return (
    <button
      data-slot="filter-bar-actions"
      type="button"
      onClick={actions?.removeAllFilters}
      className={cn(
        "flex h-7 items-center rounded-2xl border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-1 focus-visible:ring-destructive focus-visible:outline-none",
        !hasFilters && "hidden",
      )}
    >
      {strings.clear}
    </button>
  )
}

export const FilterActions = React.memo(FilterActionsImpl)
