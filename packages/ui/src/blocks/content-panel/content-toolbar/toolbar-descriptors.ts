import type { Table } from "@tanstack/react-table"

import type {
  Column as FilterColumn,
  DataTableFilterActions,
  FilterStrategy,
  FiltersState,
} from "@workspace/ui/components/filter-bar"
import type { IconName } from "@workspace/ui/icon-packs"

// The closed, DATA-only vocabulary the ContentToolbar container composes. Every
// slot is a descriptor — never a ReactNode — so a page cannot paste a raw
// control in (which would reopen the hardcoding hole ContentToolbarLegacy has).
// Icons are IconName name-strings (closed union), resolved via useIcons().

/** One processing-pipeline state (page-configured). */
export interface StatusFilterOption {
  label: string
  value: string
  count?: number
  /** Icon by NAME (closed union), resolved via useIcons() — never a node. */
  icon?: IconName
}

/** SSF descriptor — processing-status only (Human/Agent pipeline), NEVER a column filter. */
export interface StatusFilterDescriptor {
  title: string
  options: StatusFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  multiple?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface SearchDescriptor {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** The ONE multi-filter — shared by the in-bar selector and the chip band. */
export interface FilterDescriptor<TData> {
  columns: FilterColumn<TData>[]
  filters: FiltersState
  actions: DataTableFilterActions
  strategy: FilterStrategy
  open?: boolean
  onOpenChange?: (open: boolean) => void
  property?: string
  onPropertyChange?: (property: string | undefined) => void
}

/** ViewTools operates on a TanStack table handle — data, not JSX. */
export interface ViewToolsDescriptor<TData> {
  table: Table<TData>
  columnsLabel?: string
  sortTooltip?: string
}

export type ActionVariant =
  "default" | "outline" | "secondary" | "ghost" | "destructive"

/** A single page-purpose action (right #2, plural in actions[]). */
export interface ActionDescriptor {
  id: string
  label: string
  icon?: IconName
  variant?: ActionVariant
  disabled?: boolean
  tooltip?: string
  onSelect: () => void
}

export interface AddVariant {
  id: string
  label: string
  icon?: IconName
  disabled?: boolean
}

interface AddDescriptorBase {
  label?: string
  icon?: IconName
  onAdd: () => void
  align?: "start" | "end"
  disabled?: boolean
}

/**
 * The `add` slot descriptor (right #3). Supplying `variants` turns it into a
 * split button, which then REQUIRES `onSelectVariant` — the union makes a
 * dropdown-without-handler (dead menu clicks) unrepresentable.
 */
export type AddDescriptor = AddDescriptorBase &
  (
    | { variants?: undefined; onSelectVariant?: undefined }
    | { variants: AddVariant[]; onSelectVariant: (id: string) => void }
  )

export interface ContentToolbarProps<TData> {
  statusFilter?: StatusFilterDescriptor // left #1 (always first)
  search?: SearchDescriptor // left #2
  filter?: FilterDescriptor<TData> // left #3 (in-bar + band below)
  viewTools?: ViewToolsDescriptor<TData> // right #1
  actions?: ActionDescriptor[] // right #2 (plural)
  add?: AddDescriptor // right #3
  className?: string
}
