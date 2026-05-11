"use client"

import * as React from "react"
import { FilterXIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type {
  DataTableFilterActions,
  DataTableFilterStrings,
} from "./data-table-filter-types"
import { DEFAULT_STRINGS } from "./data-table-filter-types"

interface FilterActionsProps {
  hasFilters: boolean
  actions?: DataTableFilterActions
  strings?: DataTableFilterStrings
}

function FilterActionsImpl({
  hasFilters,
  actions,
  strings = DEFAULT_STRINGS,
}: FilterActionsProps) {
  return (
    <Button
      data-slot="data-table-filter-actions"
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
