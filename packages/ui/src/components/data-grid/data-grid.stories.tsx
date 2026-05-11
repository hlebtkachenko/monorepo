import type { Meta, StoryObj } from "@storybook/react"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"

import { DataGrid } from "./data-grid"

interface Person {
  name: string
  email: string
  age: number
  active: boolean
  role: string
  joined: string
  tags: string[]
  url: string
  notes: string
}

const initialData: Person[] = [
  {
    name: "Ada Lovelace",
    email: "ada@example.com",
    age: 36,
    active: true,
    role: "engineer",
    joined: "2023-01-15",
    tags: ["math", "code"],
    url: "https://example.com/ada",
    notes: "Early adopter.",
  },
  {
    name: "Alan Turing",
    email: "alan@example.com",
    age: 41,
    active: true,
    role: "researcher",
    joined: "2023-03-08",
    tags: ["crypto"],
    url: "https://example.com/alan",
    notes: "Loves puzzles.",
  },
  {
    name: "Grace Hopper",
    email: "grace@example.com",
    age: 85,
    active: false,
    role: "engineer",
    joined: "2022-11-30",
    tags: ["compiler"],
    url: "https://example.com/grace",
    notes: "Coined debugging.",
  },
  {
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    age: 72,
    active: true,
    role: "researcher",
    joined: "2024-06-21",
    tags: ["algorithms", "math"],
    url: "https://example.com/edsger",
    notes: "Shortest path.",
  },
  {
    name: "Donald Knuth",
    email: "knuth@example.com",
    age: 86,
    active: true,
    role: "researcher",
    joined: "2024-09-01",
    tags: ["art-of-programming"],
    url: "https://example.com/knuth",
    notes: "TeX creator.",
  },
]

const roleOptions = [
  { value: "engineer", label: "Engineer" },
  { value: "researcher", label: "Researcher" },
  { value: "manager", label: "Manager" },
]

const tagOptions = [
  { value: "math", label: "Math" },
  { value: "code", label: "Code" },
  { value: "crypto", label: "Crypto" },
  { value: "compiler", label: "Compiler" },
  { value: "algorithms", label: "Algorithms" },
  { value: "art-of-programming", label: "Art of programming" },
]

const baseColumns: ColumnDef<Person>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { label: "Name", cell: { variant: "short-text" } },
    size: 180,
  },
  {
    accessorKey: "email",
    header: "Email",
    meta: { label: "Email", cell: { variant: "short-text" } },
    size: 200,
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { label: "Age", cell: { variant: "number", min: 0, max: 120 } },
    size: 100,
  },
  {
    accessorKey: "active",
    header: "Active",
    meta: { label: "Active", cell: { variant: "checkbox" } },
    size: 90,
  },
]

const allColumns: ColumnDef<Person>[] = [
  ...baseColumns,
  {
    accessorKey: "role",
    header: "Role",
    meta: { label: "Role", cell: { variant: "select", options: roleOptions } },
    size: 140,
  },
  {
    accessorKey: "joined",
    header: "Joined",
    meta: { label: "Joined", cell: { variant: "date" } },
    size: 140,
  },
  {
    accessorKey: "tags",
    header: "Tags",
    meta: {
      label: "Tags",
      cell: { variant: "multi-select", options: tagOptions },
    },
    size: 200,
  },
  {
    accessorKey: "url",
    header: "URL",
    meta: { label: "URL", cell: { variant: "url" } },
    size: 200,
  },
  {
    accessorKey: "notes",
    header: "Notes",
    meta: { label: "Notes", cell: { variant: "long-text" } },
    size: 220,
  },
]

function Controlled({
  columns,
  enableSearch,
}: {
  columns: ColumnDef<Person>[]
  enableSearch?: boolean
}) {
  const [data, setData] = React.useState(initialData)
  return (
    <DataGrid<Person>
      data={data}
      columns={columns}
      onDataChange={setData}
      enableSearch={enableSearch}
    />
  )
}

const meta: Meta<typeof DataGrid> = {
  title: "Components/DataGrid",
  component: DataGrid,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof DataGrid>

export const Default: Story = {
  render: () => <Controlled columns={baseColumns} />,
}

export const WithEditing: Story = {
  render: () => <Controlled columns={baseColumns} />,
}

export const WithSorting: Story = {
  render: () => <Controlled columns={baseColumns} />,
}

export const WithSearch: Story = {
  render: () => <Controlled columns={baseColumns} enableSearch />,
}

export const WithCellTypes: Story = {
  render: () => <Controlled columns={allColumns} />,
}

export const WithContextMenu: Story = {
  render: () => <Controlled columns={baseColumns} />,
}
