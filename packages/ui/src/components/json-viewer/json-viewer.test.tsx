import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { JsonViewer } from "./json-viewer"

describe("JsonViewer", () => {
  it("renders scalar values", () => {
    render(<JsonViewer data="hello" />)
    expect(screen.getByText(/hello/)).toBeInTheDocument()
  })

  it("renders nested objects", () => {
    render(<JsonViewer data={{ name: "Hleb", age: 30 }} />)
    expect(screen.getByText("name")).toBeInTheDocument()
    expect(screen.getByText("age")).toBeInTheDocument()
  })

  it("collapses and expands objects", async () => {
    const user = userEvent.setup()
    render(<JsonViewer data={{ a: 1, b: 2 }} />)
    const toggle = screen.getAllByRole("button", { name: "Collapse" })[0]!
    await user.click(toggle)
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument()
  })

  it("filters via search when searchable", async () => {
    const user = userEvent.setup()
    render(<JsonViewer data={{ alpha: 1, beta: 2 }} searchable />)
    const input = screen.getByRole("textbox", { name: "Search JSON" })
    await user.type(input, "alpha")
    expect(screen.getByText("alpha")).toBeInTheDocument()
  })

  it("respects collapsed depth", () => {
    render(<JsonViewer data={{ a: { b: { c: 1 } } }} collapsed={1} />)
    expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0)
  })
})
