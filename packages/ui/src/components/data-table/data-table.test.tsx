import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { Checkbox } from "@workspace/ui/components/checkbox"

import { DataTable } from "./data-table"
import { DataTableColumnHeader } from "./data-table-column-header"
import { useDataTable } from "./use-data-table"

interface Row {
  id: string
  name: string
  age: number
}

const seed: Row[] = [
  { id: "1", name: "Ada", age: 36 },
  { id: "2", name: "Alan", age: 41 },
  { id: "3", name: "Grace", age: 85 },
]

const columns: ColumnDef<Row>[] = [
  {
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
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    meta: { label: "Name" },
    enableSorting: true,
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { label: "Age" },
  },
]

function Harness() {
  const { table } = useDataTable<Row>({
    data: seed,
    columns,
  })
  return <DataTable table={table} />
}

describe("DataTable", () => {
  it("renders header labels and a row per item", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: /Name/ })).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Age" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Alan")).toBeInTheDocument()
    expect(screen.getByText("Grace")).toBeInTheDocument()
  })

  it("toggles sorting when the Name header dropdown is used", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const cells = () =>
      screen
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .filter((text): text is string => Boolean(text))

    expect(cells()).toEqual(expect.arrayContaining(["Ada", "Alan", "Grace"]))

    await user.click(screen.getByRole("button", { name: /Name/ }))
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: /Desc/ }),
    )

    const rows = screen.getAllByRole("row").slice(1)
    const firstName = within(rows[0] as HTMLElement).getByText(
      /^(Ada|Alan|Grace)$/,
    )
    expect(firstName.textContent).toBe("Grace")
  })

  it("selects a row when its checkbox is clicked", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const checkbox = screen.getByRole("checkbox", { name: "Select Ada" })
    expect(checkbox).toHaveAttribute("aria-checked", "false")

    await user.click(checkbox)

    expect(
      screen.getByRole("checkbox", { name: "Select Ada" }),
    ).toHaveAttribute("aria-checked", "true")
  })
})
