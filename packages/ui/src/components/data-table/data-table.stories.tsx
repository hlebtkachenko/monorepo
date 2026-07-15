import type { Meta, StoryObj } from "@storybook/react"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"

import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Checkbox } from "@workspace/ui/components/checkbox"

import { DataTable } from "./data-table"
import { DataTableColumnHeader } from "./data-table-column-header"
import {
  ColumnManagerMenuContent,
  DataTableColumnManager,
} from "./data-table-column-manager"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"
import { useDataTable } from "./use-data-table"

interface Person {
  id: string
  name: string
  email: string
  role: "engineer" | "researcher" | "manager"
  active: boolean
  age: number
}

const seed: Person[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "engineer",
    active: true,
    age: 36,
  },
  {
    id: "2",
    name: "Alan Turing",
    email: "alan@example.com",
    role: "researcher",
    active: true,
    age: 41,
  },
  {
    id: "3",
    name: "Grace Hopper",
    email: "grace@example.com",
    role: "engineer",
    active: false,
    age: 85,
  },
  {
    id: "4",
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    role: "researcher",
    active: true,
    age: 72,
  },
  {
    id: "5",
    name: "Donald Knuth",
    email: "knuth@example.com",
    role: "researcher",
    active: true,
    age: 86,
  },
  {
    id: "6",
    name: "Margaret Hamilton",
    email: "margaret@example.com",
    role: "engineer",
    active: true,
    age: 88,
  },
  {
    id: "7",
    name: "Barbara Liskov",
    email: "barbara@example.com",
    role: "researcher",
    active: true,
    age: 85,
  },
  {
    id: "8",
    name: "Linus Torvalds",
    email: "linus@example.com",
    role: "engineer",
    active: true,
    age: 54,
  },
  {
    id: "9",
    name: "Tim Berners-Lee",
    email: "tim@example.com",
    role: "manager",
    active: false,
    age: 69,
  },
  {
    id: "10",
    name: "Brian Kernighan",
    email: "brian@example.com",
    role: "researcher",
    active: true,
    age: 82,
  },
  {
    id: "11",
    name: "Ken Thompson",
    email: "ken@example.com",
    role: "researcher",
    active: true,
    age: 81,
  },
  {
    id: "12",
    name: "Dennis Ritchie",
    email: "dennis@example.com",
    role: "engineer",
    active: false,
    age: 70,
  },
]

const roleOptions = [
  { value: "engineer", label: "Engineer" },
  { value: "researcher", label: "Researcher" },
  { value: "manager", label: "Manager" },
]

const baseColumns: ColumnDef<Person>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    meta: { label: "Name" },
    enableSorting: true,
  },
  {
    accessorKey: "email",
    header: "Email",
    meta: { label: "Email" },
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Role" />
    ),
    meta: {
      label: "Role",
      variant: "multiSelect",
      options: roleOptions,
    },
    enableColumnFilter: true,
    filterFn: (row, columnId, value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.getValue(columnId))
    },
    enableSorting: true,
  },
  {
    accessorKey: "age",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Age" />
    ),
    meta: { label: "Age" },
    enableSorting: true,
  },
]

function selectionColumn(): ColumnDef<Person> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }
}

function DefaultExample() {
  const { table } = useDataTable<Person>({
    data: seed,
    columns: baseColumns,
  })
  return <DataTable table={table} />
}

function SortingExample() {
  const { table } = useDataTable<Person>({
    data: seed,
    columns: baseColumns,
    initialState: { sorting: [{ id: "name", desc: false }] },
  })
  return <DataTable table={table} />
}

function FilteringExample() {
  const { table } = useDataTable<Person>({
    data: seed,
    columns: baseColumns,
  })
  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}

function PaginationExample() {
  const { table } = useDataTable<Person>({
    data: seed,
    columns: baseColumns,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
  })
  return (
    <div className="flex flex-col gap-2.5">
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <DataTablePagination table={table} />
    </div>
  )
}

function RowSelectionExample() {
  const columns = React.useMemo<ColumnDef<Person>[]>(
    () => [selectionColumn(), ...baseColumns],
    [],
  )
  const { table } = useDataTable<Person>({
    data: seed,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
  })
  return (
    <div className="flex flex-col gap-2.5">
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <DataTablePagination table={table} />
    </div>
  )
}

function ActionBarExample() {
  const columns = React.useMemo<ColumnDef<Person>[]>(
    () => [selectionColumn(), ...baseColumns],
    [],
  )
  const { table } = useDataTable<Person>({
    data: seed,
    columns,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 5 },
      rowSelection: { "0": true, "1": true },
    },
  })
  const selected = table.getFilteredSelectedRowModel().rows.length
  return (
    <div className="flex flex-col gap-2.5">
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <DataTablePagination table={table} />
      <ActionBar
        open={selected > 0}
        onOpenChange={(open) => {
          if (!open) table.resetRowSelection()
        }}
        aria-label="Bulk actions"
      >
        <ActionBarSelection>
          {selected} selected
          <ActionBarSeparator />
        </ActionBarSelection>
        <ActionBarGroup>
          <ActionBarItem onSelect={() => table.resetRowSelection()}>
            Delete
          </ActionBarItem>
          <ActionBarItem onSelect={() => table.resetRowSelection()}>
            Archive
          </ActionBarItem>
          <ActionBarSeparator />
          <ActionBarItem onSelect={() => table.resetRowSelection()}>
            Cancel
          </ActionBarItem>
        </ActionBarGroup>
      </ActionBar>
    </div>
  )
}

function ColumnManagerExample() {
  const { table } = useDataTable<Person>({
    data: seed,
    columns: baseColumns,
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DataTableColumnManager table={table} />
      </div>
      <DataTable table={table} />
    </div>
  )
}

const meta: Meta<typeof DataTable> = {
  title: "Components/DataTable",
  component: DataTable,
  parameters: { layout: "padded" },
}
export default meta

type Story = StoryObj<typeof DataTable>

export const Default: Story = {
  render: () => <DefaultExample />,
}

export const WithSorting: Story = {
  render: () => <SortingExample />,
}

export const WithFiltering: Story = {
  render: () => <FilteringExample />,
}

export const WithPagination: Story = {
  render: () => <PaginationExample />,
}

export const WithRowSelection: Story = {
  render: () => <RowSelectionExample />,
}

export const WithActionBar: Story = {
  render: () => <ActionBarExample />,
}

/** Drag rows to reorder columns; the eye toggles each column's visibility. */
export const WithColumnManager: Story = {
  render: () => <ColumnManagerExample />,
}

function ColumnManagerOpenExample() {
  const { table } = useDataTable<Person>({ data: seed, columns: baseColumns })
  return (
    <div className="w-64 rounded-md border p-1">
      <ColumnManagerMenuContent table={table} />
    </div>
  )
}

/**
 * The manager list rendered inline (as if the popover were open) so the a11y
 * gate actually covers it — the closed popover in `WithColumnManager` hides the
 * content from axe, which let a nested-interactive row toggle slip through once.
 */
export const ColumnManagerOpen: Story = {
  render: () => <ColumnManagerOpenExample />,
}
