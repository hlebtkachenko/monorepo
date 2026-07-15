import type { Table } from "@tanstack/react-table"

import type {
  ActionDescriptor,
  AddDescriptor,
  ContentToolbarProps,
  FilterDescriptor,
  StatusFilterOption,
} from "./toolbar-descriptors"

/** Page-level intent for the Single Status Filter — the table-column plumbing
 * (read the value, clear-on-empty) is wired for you against the live table. */
export interface TableToolbarStatus {
  /** The table column the faceted status control filters (e.g. `"status"`). */
  columnId: string
  title: string
  options: StatusFilterOption[]
  multiple?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface BuildTableToolbarOptions<TData> {
  /** Universal search box; its `onChange` is wired to `table.setGlobalFilter` too. */
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }
  /** The Single Status Filter, wired to a table column's faceted filter. */
  status?: TableToolbarStatus
  /** The multi-filter slot, e.g. straight from `useTableFilters().filter`. */
  filter?: FilterDescriptor<TData>
  actions?: ActionDescriptor[]
  add?: AddDescriptor
  /** Include the columns manager (`viewTools`). Default true. */
  columnsManager?: boolean
}

/**
 * Assemble a standard table `ContentToolbarProps` from page-level intent. It
 * defaults the columns manager on and encapsulates the two bits every table page
 * otherwise re-wires by hand: the search box driving `table.setGlobalFilter`, and
 * the Single Status Filter reading/writing its delegated table column
 * (`getFilterValue()` / clear-on-empty `setFilterValue`). Call it inside the
 * archetype's `toolbar={(table) => …}` callback.
 *
 * ```ts
 * toolbar={(table) => buildTableToolbar(table, {
 *   search: { value: search, onChange: setSearch },
 *   status: { columnId: "status", title: "Status", options: STATUS_OPTIONS },
 *   filter,            // from useTableFilters
 *   add: { label: "Add", onAdd },
 * })}
 * ```
 */
export function buildTableToolbar<TData>(
  table: Table<TData> | null,
  opts: BuildTableToolbarOptions<TData> = {},
): ContentToolbarProps<TData> {
  const toolbar: ContentToolbarProps<TData> = {}

  // The column delegated to the Single Status Filter must NOT also appear in the
  // multi-filter — but since columns are now filterable BY DEFAULT, that column
  // lands in `filter.columns` automatically. Drop it here (rather than forcing
  // every page to set `filter: false` on it) so a column is filtered by exactly
  // one system. See docs/specs/TABLE-FILTERS.md.
  const filterDescriptor =
    opts.status && opts.filter
      ? {
          ...opts.filter,
          columns: opts.filter.columns.filter(
            (column) => column.id !== opts.status!.columnId,
          ),
        }
      : opts.filter

  if (opts.search) {
    const { value, onChange, placeholder } = opts.search
    toolbar.search = {
      value,
      placeholder,
      onChange: (next) => {
        onChange(next)
        table?.setGlobalFilter(next)
      },
    }
  }

  if (opts.status && table) {
    const { columnId, title, options, multiple, open, onOpenChange } =
      opts.status
    const column = table.getColumn(columnId)
    const value = (column?.getFilterValue() as string[] | undefined) ?? []
    toolbar.statusFilter = {
      title,
      columnId,
      options,
      value,
      onChange: (next) =>
        column?.setFilterValue(next.length ? next : undefined),
      multiple: multiple ?? true,
      open,
      onOpenChange,
    }
  }

  if (filterDescriptor) toolbar.filter = filterDescriptor
  if (opts.actions) toolbar.actions = opts.actions
  if (opts.add) toolbar.add = opts.add
  if ((opts.columnsManager ?? true) && table) toolbar.viewTools = { table }

  return toolbar
}
