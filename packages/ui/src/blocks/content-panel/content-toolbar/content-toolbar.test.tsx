import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentToolbarAddButton } from "./content-toolbar-add-button"
import { ContentToolbarModeToggle } from "./content-toolbar-mode-toggle"
import { ContentToolbarStatusFilter } from "./content-toolbar-status-filter"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const STATUS = [
  { value: "New", label: "New" },
  { value: "Posted", label: "Posted" },
  { value: "Void", label: "Void" },
]

describe("ContentToolbarStatusFilter", () => {
  it("shows the title and per-option badges for a small selection", () => {
    wrap(
      <ContentToolbarStatusFilter
        title="Status"
        options={STATUS}
        value={["New", "Posted"]}
        onChange={() => {}}
        multiple
      />,
    )
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("New")).toBeInTheDocument()
    expect(screen.getByText("Posted")).toBeInTheDocument()
  })

  it("collapses to 'N selected' above two", () => {
    wrap(
      <ContentToolbarStatusFilter
        title="Status"
        options={STATUS}
        value={["New", "Posted", "Void"]}
        onChange={() => {}}
        multiple
      />,
    )
    expect(screen.getByText("3 selected")).toBeInTheDocument()
  })

  it("clears the selection from the trigger", async () => {
    const onChange = vi.fn()
    wrap(
      <ContentToolbarStatusFilter
        title="Status"
        options={STATUS}
        value={["New"]}
        onChange={onChange}
        multiple
      />,
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Clear Status filter" }),
    )
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("adds a value when an option is picked (multiple)", async () => {
    const onChange = vi.fn()
    wrap(
      <ContentToolbarStatusFilter
        title="Status"
        options={STATUS}
        value={[]}
        onChange={onChange}
        multiple
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /status/i }))
    await userEvent.click(await screen.findByText("Posted"))
    expect(onChange).toHaveBeenCalledWith(["Posted"])
  })
})

describe("ContentToolbarModeToggle", () => {
  it("fires onChange with the picked inspector mode", async () => {
    const onChange = vi.fn()
    wrap(<ContentToolbarModeToggle value="panel" onChange={onChange} />)
    await userEvent.click(screen.getByLabelText("Inspector as dialog"))
    expect(onChange).toHaveBeenCalledWith("dialog")
  })
})

describe("ContentToolbarAddButton", () => {
  it("fires onAdd from the primary button", async () => {
    const onAdd = vi.fn()
    wrap(<ContentToolbarAddButton label="Add invoice" onAdd={onAdd} />)
    await userEvent.click(screen.getByRole("button", { name: /add invoice/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
