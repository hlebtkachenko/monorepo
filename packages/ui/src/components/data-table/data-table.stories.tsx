import type { Meta, StoryObj } from "@storybook/react"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"

import { DataTable } from "./data-table"
import { DataTableColumnHeader } from "./data-table-column-header"
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
    <DataTable table={table}>
      <DataTableToolbar table={table} />
      <DataTablePagination table={table} />
    </DataTable>
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
    <DataTable table={table}>
      <DataTableToolbar table={table} />
      <DataTablePagination table={table} />
    </DataTable>
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
    <DataTable
      table={table}
      actionBar={
        <div
          className="flex items-center gap-2 rounded-md border bg-muted/40 p-2"
          role="group"
          aria-label="Bulk actions"
        >
          <span className="text-sm text-muted-foreground">
            {selected} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => table.resetRowSelection()}
          >
            Clear
          </Button>
          <Button size="sm">Archive</Button>
        </div>
      }
    >
      <DataTableToolbar table={table} />
      <DataTablePagination table={table} />
    </DataTable>
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
