"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/content-panel"
import type {
  Column as FilterColumn,
  DataTableFilterActions,
  FilterStrategy,
  FiltersState,
} from "@workspace/ui/components/filter-bar"

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
}

/**
 * The invoices toolbar — the CANONICAL reference for the closed `ContentToolbar`
 * vocabulary. Everything is a DATA descriptor (no raw controls): the SSF-style
 * `statusFilter`, a universal `search`, the multi-`filter` (chips render in the
 * band below the bar), then `viewTools` (Columns + Sort) and the split `add`.
 * The container owns the order + the filters band.
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
}: TableDemoToolbarProps) {
  const statusColumn = table.getColumn("status")
  const statusValue = (statusColumn?.getFilterValue() as string[]) ?? []

  return (
    <ContentToolbar<InvoiceRow>
      statusFilter={{
        title: "Status",
        options: INVOICE_STATUS_OPTIONS,
        value: statusValue,
        onChange: (value) =>
          statusColumn?.setFilterValue(value.length ? value : undefined),
        multiple: true,
        open: statusOpen,
        onOpenChange: onStatusOpenChange,
      }}
      search={{ value: search, onChange: onSearchChange }}
      filter={{
        columns: filterColumns,
        filters,
        actions: filterActions,
        strategy: filterStrategy,
        open: selectorOpen,
        onOpenChange: onSelectorOpenChange,
        property: selectorProperty,
        onPropertyChange: onSelectorPropertyChange,
      }}
      viewTools={{ table }}
      add={{
        label: "Add invoice",
        onAdd: () => {},
        variants: ADD_TYPES.map((type) => ({ id: type, label: type })),
        onSelectVariant: () => {},
      }}
    />
  )
}
