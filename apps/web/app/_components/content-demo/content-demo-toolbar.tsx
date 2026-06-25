"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/app-content"
import type { InspectorMode } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DataTableFacetedFilter,
  DataTableMultiSort,
  getColumnLabel,
} from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import {
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  Search,
  SquareMousePointer,
} from "@workspace/ui/lib/icons"
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
import { cn } from "@workspace/ui/lib/utils"
import { useIcons } from "@workspace/ui/icon-packs"

import { INVOICE_STATUS_OPTIONS, type InvoiceRow } from "./data"

const ADD_TYPES = ["Tax document", "Advance", "Credit note", "Settlement"]

/** Insert `sourceId` before/after `targetId` within the non-pinned center group. */
function reorderColumn(
  table: Table<InvoiceRow>,
  sourceId: string,
  targetId: string,
  edge: "top" | "bottom",
) {
  if (sourceId === targetId) return
  const order = table.getState().columnOrder.length
    ? table.getState().columnOrder
    : table.getAllLeafColumns().map((c) => c.id)
  const center = order.filter((id) => !table.getColumn(id)?.getIsPinned())
  const from = center.indexOf(sourceId)
  if (from < 0) return
  const next = [...center]
  const [moved] = next.splice(from, 1)
  if (moved == null) return
  const to = next.indexOf(targetId)
  if (to < 0) return
  next.splice(edge === "top" ? to : to + 1, 0, moved)
  const left = order.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "left",
  )
  const right = order.filter(
    (id) => table.getColumn(id)?.getIsPinned() === "right",
  )
  table.setColumnOrder([...left, ...next, ...right])
}

/**
 * The column manager — a titled, drag-reorderable list (grip handle + a dark
 * separator at the drop position) where each row's eye toggles visibility.
 * Shared by the toolbar "Columns" button and the grid's "+ Add column".
 */
export function ColumnManagerMenuContent({
  table,
}: {
  table: Table<InvoiceRow>
}) {
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    id: string
    edge: "top" | "bottom"
  } | null>(null)
  const columns = table.getAllColumns().filter((column) => column.getCanHide())

  return (
    <>
      <DropdownMenuLabel>Columns</DropdownMenuLabel>
      {columns.map((column) => {
        const visible = column.getIsVisible()
        const ToggleIcon = visible ? Eye : EyeOff
        const label = getColumnLabel(column)
        const over = dropTarget?.id === column.id
        return (
          <div key={column.id} className="relative">
            {over && dropTarget.edge === "top" ? (
              <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
            <div
              draggable
              onDragStart={(event) => {
                // setData + effectAllowed are required for the drag to actually
                // start (Firefox) and for the native "held" drag image to show.
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", column.id)
                setDragId(column.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropTarget(null)
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === column.id) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = "move"
                const rect = event.currentTarget.getBoundingClientRect()
                const edge =
                  event.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
                setDropTarget({ id: column.id, edge })
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (dragId) {
                  reorderColumn(
                    table,
                    dragId,
                    column.id,
                    dropTarget?.edge ?? "top",
                  )
                }
                setDragId(null)
                setDropTarget(null)
              }}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                // The dragged row "lifts": it dims in place while its full-opacity
                // native ghost follows the cursor.
                dragId === column.id && "opacity-40",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
              <span
                className={cn(
                  "flex-1 truncate",
                  !visible && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <button
                type="button"
                aria-label={visible ? `Hide ${label}` : `Show ${label}`}
                onClick={() => column.toggleVisibility(!visible)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ToggleIcon className="size-4" />
              </button>
            </div>
            {over && dropTarget.edge === "bottom" ? (
              <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** The toolbar "Columns" button — opens the shared column manager. */
function ColumnsButton({ table }: { table: Table<InvoiceRow> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <ColumnManagerMenuContent table={table} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface ContentDemoToolbarProps {
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
export function ContentDemoToolbar({
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
}: ContentDemoToolbarProps) {
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
          <ColumnsButton table={table} />
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
