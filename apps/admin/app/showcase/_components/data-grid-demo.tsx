"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataGrid } from "@workspace/ui/components/data-grid"

interface Person {
  name: string
  email: string
  age: number
  active: boolean
  role: string
  joined: string
}

const SEED: Person[] = [
  {
    name: "Ada Lovelace",
    email: "ada@example.com",
    age: 36,
    active: true,
    role: "engineer",
    joined: "2023-01-15",
  },
  {
    name: "Alan Turing",
    email: "alan@example.com",
    age: 41,
    active: true,
    role: "researcher",
    joined: "2023-03-08",
  },
  {
    name: "Grace Hopper",
    email: "grace@example.com",
    age: 85,
    active: false,
    role: "engineer",
    joined: "2022-11-30",
  },
  {
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    age: 72,
    active: true,
    role: "researcher",
    joined: "2024-06-21",
  },
  {
    name: "Donald Knuth",
    email: "knuth@example.com",
    age: 86,
    active: true,
    role: "researcher",
    joined: "2024-09-01",
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
    header: "Name",
    meta: { label: "Name", cell: { variant: "short-text" } },
    size: 150,
  },
  {
    accessorKey: "email",
    header: "Email",
    meta: { label: "Email", cell: { variant: "short-text" } },
    size: 180,
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: {
      label: "Age",
      cell: { variant: "number", min: 0, max: 120, decimals: 0 },
    },
    size: 90,
  },
  {
    accessorKey: "active",
    header: "Active",
    meta: { label: "Active", cell: { variant: "checkbox" } },
    size: 110,
  },
  {
    accessorKey: "role",
    header: "Role",
    meta: { label: "Role", cell: { variant: "select", options: ROLE_OPTIONS } },
    size: 130,
  },
  {
    accessorKey: "joined",
    header: "Joined",
    meta: { label: "Joined", cell: { variant: "date" } },
    size: 130,
  },
]

export function DataGridDemo() {
  const [data, setData] = React.useState(SEED)

  return (
    <DataGrid<Person>
      data={data}
      columns={COLUMNS}
      onDataChange={setData}
      enableSearch
    />
  )
}
