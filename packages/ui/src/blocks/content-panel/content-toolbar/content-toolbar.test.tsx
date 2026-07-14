import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentToolbar } from "./content-toolbar"
import { ContentToolbarAddButton } from "./content-toolbar-add-button"
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

describe("ContentToolbarAddButton", () => {
  it("fires onAdd from the primary button", async () => {
    const onAdd = vi.fn()
    wrap(<ContentToolbarAddButton label="Add invoice" onAdd={onAdd} />)
    await userEvent.click(screen.getByRole("button", { name: /add invoice/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it("fires onSelectVariant from the split-button dropdown", async () => {
    const onSelectVariant = vi.fn()
    wrap(
      <ContentToolbarAddButton
        label="Add invoice"
        onAdd={() => {}}
        variants={[
          { id: "received", label: "Received" },
          { id: "issued", label: "Issued" },
        ]}
        onSelectVariant={onSelectVariant}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Choose type" }))
    await userEvent.click(await screen.findByText("Issued"))
    expect(onSelectVariant).toHaveBeenCalledWith("issued")
  })
})

describe("ContentToolbar (container)", () => {
  it("renders left slots before right slots and omits the filter band with no active filters", () => {
    const { container } = wrap(
      <ContentToolbar
        statusFilter={{
          title: "Status",
          options: STATUS,
          value: [],
          onChange: () => {},
          multiple: true,
        }}
        actions={[{ id: "refresh", label: "Refresh", onSelect: () => {} }]}
        add={{ label: "New", onAdd: () => {} }}
      />,
    )
    // The active-filters band mounts only when filter.filters.length > 0.
    expect(
      container.querySelector('[data-slot="content-toolbar-filter-band"]'),
    ).toBeNull()
    // statusFilter (left cluster) renders ahead of add (right cluster).
    const status = screen.getByRole("button", { name: /status/i })
    const add = screen.getByRole("button", { name: /new/i })
    expect(
      status.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("maps actions[] to buttons that each fire their own onSelect", async () => {
    const refresh = vi.fn()
    const exportCsv = vi.fn()
    wrap(
      <ContentToolbar
        actions={[
          { id: "refresh", label: "Refresh", onSelect: refresh },
          { id: "export", label: "Export", onSelect: exportCsv },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Export" }))
    expect(exportCsv).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })
})
