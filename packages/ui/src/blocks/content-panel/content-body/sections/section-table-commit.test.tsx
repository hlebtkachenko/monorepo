import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SectionTableProvider } from "./section-table-context"
import { SectionTableRenderer } from "./section-table-renderer"
import { sectionTable } from "./section-table"

/** A one-column, one-row inline-editable Table payload. */
function payload() {
  return sectionTable({
    rowIdKey: "id",
    columns: [{ id: "name", header: "Name", kind: "text", edit: "inline" }],
    rows: [{ id: "1", name: "Ada" }],
    features: {
      selection: "none",
      search: false,
      inspect: false,
      rowActions: false,
    },
  }).props
}

describe("SectionTableRenderer — inline cell commit bridge", () => {
  it("persists an inline edit through onCellCommit", async () => {
    const user = userEvent.setup()
    const commit = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={payload()} />
      </SectionTableProvider>,
    )
    const input = screen.getByRole("textbox")
    await user.clear(input)
    await user.type(input, "Grace")
    await user.tab() // blur commits

    expect(commit).toHaveBeenCalledWith({
      rowId: "1",
      columnId: "name",
      value: "Grace",
    })
  })

  it("reverts the cell when the commit rejects", async () => {
    const user = userEvent.setup()
    const commit = vi.fn().mockRejectedValue(new Error("write failed"))
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={payload()} />
      </SectionTableProvider>,
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    await user.clear(input)
    await user.type(input, "Zed")
    await user.tab()

    // Optimistic value rolls back to the prior cell value on rejection.
    await waitFor(() =>
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
        "Ada",
      ),
    )
  })
})
