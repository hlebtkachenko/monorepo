import type { Meta, StoryObj } from "@storybook/react"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"

import { useDataTable } from "../data-table/use-data-table"
import { DataGridView } from "./data-grid-view"

interface Person {
  id: string
  name: string
  role: "Engineer" | "Designer" | "Manager"
  team: string
  status: "Active" | "On leave"
}

const seed: Person[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    role: "Engineer",
    team: "Platform",
    status: "Active",
  },
  {
    id: "2",
    name: "Alan Turing",
    role: "Manager",
    team: "Research",
    status: "Active",
  },
  {
    id: "3",
    name: "Grace Hopper",
    role: "Engineer",
    team: "Compilers",
    status: "On leave",
  },
  {
    id: "4",
    name: "Edsger Dijkstra",
    role: "Designer",
    team: "Systems",
    status: "Active",
  },
  {
    id: "5",
    name: "Donald Knuth",
    role: "Engineer",
    team: "Algorithms",
    status: "Active",
  },
]

const columns: ColumnDef<Person>[] = [
  {
    id: "select",
    size: 44,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
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
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 200,
    meta: { label: "Name" },
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  { accessorKey: "role", header: "Role", size: 140, meta: { label: "Role" } },
  { accessorKey: "team", header: "Team", size: 160, meta: { label: "Team" } },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    meta: { label: "Status" },
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "Active" ? "default" : "secondary"}
      >
        {row.original.status}
      </Badge>
    ),
  },
]

function Demo({ data = seed }: { data?: Person[] }) {
  const { table } = useDataTable<Person>({
    data,
    columns,
    getRowId: (row) => row.id,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 56, size: 150, maxSize: 480 },
    initialState: { columnPinning: { left: ["select"] } },
  })
  return (
    <div className="h-[360px] w-[680px] overflow-hidden rounded-md border">
      <DataGridView table={table} className="h-full" />
    </div>
  )
}

const meta: Meta<typeof DataGridView> = {
  title: "Components/DataGridView",
  component: DataGridView,
  parameters: { layout: "centered" },
}

export default meta
type Story = StoryObj<typeof DataGridView>

/** A full grid: resize a column edge, drag a header to reorder, sort or hide
 *  from the header menu, and arrow-key between cells. */
export const Default: Story = {
  render: () => <Demo />,
}

/** The empty state when the table has no rows. */
export const Empty: Story = {
  render: () => <Demo data={[]} />,
}
