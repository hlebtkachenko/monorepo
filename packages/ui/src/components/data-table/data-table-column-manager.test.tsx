import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"

import { ColumnManagerMenuContent } from "./data-table-column-manager"

interface Row {
  a: string
  b: string
}
const columns: ColumnDef<Row>[] = [
  { accessorKey: "a", header: "Alpha", meta: { label: "Alpha" } },
  { accessorKey: "b", header: "Beta", meta: { label: "Beta" } },
]
function Harness() {
  const table = useReactTable<Row>({
    data: [{ a: "1", b: "2" }],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return <ColumnManagerMenuContent table={table} />
}

describe("ColumnManagerMenuContent", () => {
  it("renders no nested <button> (button-in-button crashes hydration)", () => {
    // Regression: the row toggle was a real <button> wrapping the Radix
    // Checkbox (also a <button>). The visibility indicator must stay
    // non-interactive so nothing nests inside the row's role="button".
    const { container } = render(<Harness />)
    expect(container.querySelectorAll("button button")).toHaveLength(0)
    expect(screen.getAllByRole("button", { name: /Hide|Show/ })).toHaveLength(2)
  })

  it("toggles a column's visibility on click", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Hide Alpha" }))
    expect(
      screen.getByRole("button", { name: "Show Alpha" }),
    ).toBeInTheDocument()
  })

  it("toggles via keyboard (Enter)", () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Hide Beta" }), {
      key: "Enter",
    })
    expect(
      screen.getByRole("button", { name: "Show Beta" }),
    ).toBeInTheDocument()
  })
})
