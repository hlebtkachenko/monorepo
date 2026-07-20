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
  /**
   * A group/ungroup toggle for an expandable grid (Tree-table / Pivot): a single
   * toolbar action that collapses or expands EVERY row at once, driven off the
   * live table's expansion state. Shown only when the table has expandable rows.
   * When everything is expanded (ungrouped) it offers "group" (collapse-all) with
   * the `ListChevronsDownUp` icon; when collapsed (grouped) it offers "ungroup"
   * (expand-all) with `ListChevronsUpDown`. Labels are page-supplied (i18n).
   */
  expandAll?: { groupLabel: string; ungroupLabel: string }
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

  const actions: ActionDescriptor[] = opts.actions ? [...opts.actions] : []
  // The group/ungroup (collapse-all / expand-all) toggle for an expandable grid.
  if (opts.expandAll && table && table.getCanSomeRowsExpand()) {
    const allExpanded = table.getIsAllRowsExpanded()
    actions.push({
      id: "expand-toggle",
      label: allExpanded
        ? opts.expandAll.groupLabel
        : opts.expandAll.ungroupLabel,
      icon: allExpanded ? "ListChevronsDownUp" : "ListChevronsUpDown",
      variant: "outline",
      tooltip: allExpanded
        ? opts.expandAll.groupLabel
        : opts.expandAll.ungroupLabel,
      onSelect: () => table.toggleAllRowsExpanded(!allExpanded),
    })
  }
  if (actions.length > 0) toolbar.actions = actions

  if (opts.add) toolbar.add = opts.add
  if ((opts.columnsManager ?? true) && table) toolbar.viewTools = { table }

  return toolbar
}
