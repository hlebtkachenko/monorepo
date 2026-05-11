import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { DataGrid } from "./data-grid"

interface Row {
  name: string
  age: number
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { label: "Name", cell: { variant: "short-text" } },
    size: 160,
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { label: "Age", cell: { variant: "number" } },
    size: 100,
  },
]

const seed: Row[] = [
  { name: "Ada", age: 36 },
  { name: "Alan", age: 41 },
  { name: "Grace", age: 85 },
  { name: "Edsger", age: 72 },
  { name: "Donald", age: 86 },
]

function Controlled(props: { enableSearch?: boolean }) {
  const [data, setData] = React.useState(seed)
  return (
    <DataGrid<Row>
      data={data}
      columns={columns}
      onDataChange={setData}
      enableSearch={props.enableSearch}
    />
  )
}

describe("DataGrid", () => {
  it("renders header labels and row values", () => {
    render(<Controlled />)
    expect(
      screen.getByRole("columnheader", { name: /Name/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: /Age/ }),
    ).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Grace")).toBeInTheDocument()
  })

  it("enters edit mode on second cell click and commits new value", async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const cells = screen.getAllByRole("gridcell")
    const adaCellWrapper = cells[0]?.querySelector(
      "[data-slot=data-grid-cell-wrapper]",
    )
    expect(adaCellWrapper).not.toBeNull()
    await user.click(adaCellWrapper as HTMLElement)
    await user.click(adaCellWrapper as HTMLElement)
    const input = adaCellWrapper?.querySelector(
      "input",
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    if (!input) return
    await user.clear(input)
    await user.type(input, "Ada Lovelace")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
  })

  it("filters matches via search input", async () => {
    const user = userEvent.setup()
    render(<Controlled enableSearch />)
    await user.click(screen.getByRole("button", { name: "Open search" }))
    const input = screen.getByPlaceholderText("Find in grid...")
    await user.type(input, "Grace")
    expect(screen.getByText("1 of 1")).toBeInTheDocument()
  })
})
