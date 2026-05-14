"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import {
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  useDataTable,
} from "@workspace/ui/components/data-table"

interface Person {
  id: string
  name: string
  email: string
  role: "engineer" | "researcher" | "manager"
  active: boolean
  age: number
}

const SEED: Person[] = [
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
    name: "Tim Berners-Lee",
    email: "tim@example.com",
    role: "manager",
    active: false,
    age: 69,
  },
]

const ROLE_OPTIONS = [
  { value: "engineer", label: "Engineer" },
  { value: "researcher", label: "Researcher" },
  { value: "manager", label: "Manager" },
]

const COLUMNS: ColumnDef<Person>[] = [
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
    meta: { label: "Role", variant: "multiSelect", options: ROLE_OPTIONS },
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

export function DataTableDemo() {
  const { table } = useDataTable<Person>({
    data: SEED,
    columns: COLUMNS,
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
