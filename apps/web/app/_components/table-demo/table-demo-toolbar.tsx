"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/app-content"
import type { InspectorMode } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  ActiveFilters,
  FilterActions,
  FilterSelector,
  type Column as FilterColumn,
  type DataTableFilterActions,
  type FilterStrategy,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { Input } from "@workspace/ui/components/input"
import { Search, SquareMousePointer } from "@workspace/ui/lib/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { useIcons } from "@workspace/ui/icon-packs"

import { INVOICE_STATUS_OPTIONS, type InvoiceRow } from "./data"

const ADD_TYPES = ["Tax document", "Advance", "Credit note", "Settlement"]

export interface TableDemoToolbarProps {
  table: Table<InvoiceRow>
  /** FilterBar wiring (document / partner / amount / vat / date). */
  filterColumns: FilterColumn<InvoiceRow>[]
  filters: FiltersState
  filterActions: DataTableFilterActions
  filterStrategy: FilterStrategy
  /** Controlled FilterBar selector — let a grid header open a column's editor. */
  selectorOpen: boolean
  onSelectorOpenChange: (open: boolean) => void
  selectorProperty: string | undefined
  onSelectorPropertyChange: (property: string | undefined) => void
  /** Controlled Status faceted filter (Status is its own toolbar control). */
  statusOpen: boolean
  onStatusOpenChange: (open: boolean) => void
  /** Universal text search across every column. */
  search: string
  onSearchChange: (value: string) => void
  inspectorMode: InspectorMode
  onInspectorModeChange: (mode: InspectorMode) => void
}

/**
 * TEMP — the invoices toolbar. Left: Status (its own faceted control) + a
 * universal Search + the FilterBar (per-column filters, also opened from the
 * grid headers). Right: Columns, Sort, a split "Add invoice" button, and the
 * Inspector view switch (rightmost).
 */
export function TableDemoToolbar({
  table,
  filterColumns,
  filters,
  filterActions,
  filterStrategy,
  selectorOpen,
  onSelectorOpenChange,
  selectorProperty,
  onSelectorPropertyChange,
  statusOpen,
  onStatusOpenChange,
  search,
  onSearchChange,
  inspectorMode,
  onInspectorModeChange,
}: TableDemoToolbarProps) {
  const icons = useIcons()
  const PlusIcon = icons.Plus
  const ChevronIcon = icons.ChevronDown
  const DialogIcon = icons.Maximize2

  const statusColumn = table.getColumn("status")

  return (
    <ContentToolbar
      left={
        <>
          {statusColumn ? (
            <DataTableFacetedFilter
              column={statusColumn}
              title="Status"
              options={INVOICE_STATUS_OPTIONS}
              multiple
              open={statusOpen}
              onOpenChange={onStatusOpenChange}
            />
          ) : null}
          <div className="relative flex h-7 w-80 items-center">
            <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
            <Input
              placeholder="Search anything…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-7 w-full pl-8"
            />
          </div>
          {/* The filter bar travels as one unit: when the funnel + active
              filters + Clear don't fit on row 1 they wrap to row 2 together
              (the funnel never strands itself above its own filters). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterSelector
              columns={filterColumns}
              filters={filters}
              actions={filterActions}
              strategy={filterStrategy}
              open={selectorOpen}
              onOpenChange={onSelectorOpenChange}
              property={selectorProperty}
              onPropertyChange={onSelectorPropertyChange}
            />
            <ActiveFilters
              columns={filterColumns}
              filters={filters}
              actions={filterActions}
              strategy={filterStrategy}
            />
            <FilterActions
              hasFilters={filters.length > 0}
              actions={filterActions}
            />
          </div>
        </>
      }
      right={
        <>
          <DataTableColumnManager table={table} />
          <DataTableMultiSort table={table} />
          <ButtonGroup>
            <Button size="sm">
              <PlusIcon />
              Add invoice
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" aria-label="Choose type">
                  <ChevronIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {ADD_TYPES.map((type) => (
                  <DropdownMenuItem key={type}>{type}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroup
                  type="single"
                  value={inspectorMode}
                  onValueChange={(value) => {
                    if (value) onInspectorModeChange(value as InspectorMode)
                  }}
                  variant="outline"
                  size="sm"
                  // Extra left margin = double the toolbar gap between the
                  // "Add invoice" group and the Inspector view switch.
                  className="ms-1"
                >
                  <ToggleGroupItem
                    value="panel"
                    aria-label="Inspector as panel"
                  >
                    <SquareMousePointer />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="dialog"
                    aria-label="Inspector as dialog"
                  >
                    <DialogIcon />
                  </ToggleGroupItem>
                </ToggleGroup>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Inspector view — panel or dialog
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      }
    />
  )
}
