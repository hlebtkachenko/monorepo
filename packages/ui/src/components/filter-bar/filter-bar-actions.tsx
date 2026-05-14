"use client"

import * as React from "react"
import { FilterXIcon } from "@workspace/ui/lib/icons"
import { Button } from "@workspace/ui/components/button"
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
  return (
    <Button
      data-slot="filter-bar-actions"
      className={cn("h-7 !px-2", !hasFilters && "hidden")}
      variant="destructive"
      onClick={actions?.removeAllFilters}
    >
      <FilterXIcon />
      <span className="hidden md:block">{strings.clear}</span>
    </Button>
  )
}

export const FilterActions = React.memo(FilterActionsImpl)
