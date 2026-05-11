import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CircleDotIcon, TypeIcon } from "lucide-react"
import * as React from "react"
import {
  createColumnConfigHelper,
  DataTableFilter,
  useDataTableFilters,
} from "./data-table-filter"

type Row = { id: string; name: string; status: "todo" | "done" }

const data: Row[] = [
  { id: "1", name: "Alpha", status: "todo" },
  { id: "2", name: "Beta", status: "done" },
]

const dtf = createColumnConfigHelper<Row>()

const columnsConfig = [
  dtf
    .text()
    .id("name")
    .accessor((r) => r.name)
    .displayName("Name")
    .icon(TypeIcon)
    .build(),
  dtf
    .option()
    .id("status")
    .accessor((r) => r.status)
    .displayName("Status")
    .icon(CircleDotIcon)
    .options([
      { value: "todo", label: "Todo" },
      { value: "done", label: "Done" },
    ])
    .build(),
] as const

function Harness() {
  const { columns, filters, actions, strategy } = useDataTableFilters({
    strategy: "client" as const,
    data,
    columnsConfig,
  })
  return (
    <DataTableFilter
      columns={columns}
      filters={filters}
      actions={actions}
      strategy={strategy}
    />
  )
}

describe("DataTableFilter", () => {
  it("renders filter trigger", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: /Filter/i })).toBeInTheDocument()
  })

  it("adds a filter and shows a pill chip", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: /Filter/i }))
    await user.click(await screen.findByRole("option", { name: /Status/i }))
    await user.click(await screen.findByRole("option", { name: /Todo/i }))
    const pill = document.querySelector('[data-slot="data-table-filter-pill"]')
    expect(pill).not.toBeNull()
  })

  it("clear-all removes all filters", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: /Filter/i }))
    await user.click(await screen.findByRole("option", { name: /Status/i }))
    await user.click(await screen.findByRole("option", { name: /Todo/i }))
    expect(
      document.querySelector('[data-slot="data-table-filter-pill"]'),
    ).not.toBeNull()
    const clearBtn = document.querySelector(
      '[data-slot="data-table-filter-actions"]',
    ) as HTMLButtonElement | null
    expect(clearBtn).not.toBeNull()
    await user.click(clearBtn!)
    expect(
      document.querySelector('[data-slot="data-table-filter-pill"]'),
    ).toBeNull()
  })
})
