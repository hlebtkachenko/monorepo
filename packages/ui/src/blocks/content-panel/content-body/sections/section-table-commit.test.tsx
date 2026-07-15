import { render, screen, fireEvent, waitFor } from "@testing-library/react"
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
      search: false,
      inspect: false,
      rowActions: false,
    },
  }).props
}

/** A one-column, one-row inline-editable NUMBER Table payload. */
function numericPayload() {
  return sectionTable({
    rowIdKey: "id",
    columns: [
      { id: "amount", header: "Amount", kind: "number", edit: "inline" },
    ],
    rows: [{ id: "1", amount: 10 }],
    features: {
      search: false,
      inspect: false,
      rowActions: false,
    },
  }).props
}

/** A void promise whose settlement is driven manually (deferred), for race tests. */
function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res()
    reject = rej
  })
  return { promise, resolve, reject }
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

  it("a stale rejection does not clobber a newer confirmed edit (C4)", async () => {
    const commits: Array<ReturnType<typeof deferred>> = []
    const commit = vi.fn(() => {
      const d = deferred()
      commits.push(d)
      return d.promise
    })
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={payload()} />
      </SectionTableProvider>,
    )
    const input = () => screen.getByRole("textbox") as HTMLInputElement

    // Edit 1: Ada → Bee (commit #0 pending).
    fireEvent.change(input(), { target: { value: "Bee" } })
    fireEvent.blur(input())
    // Edit 2: Bee → Cid (commit #1 pending).
    fireEvent.change(input(), { target: { value: "Cid" } })
    fireEvent.blur(input())
    expect(commits).toHaveLength(2)

    // Newer edit confirms first, then the OLDER edit rejects late.
    commits[1]!.resolve()
    await Promise.resolve()
    commits[0]!.reject(new Error("stale write failed"))

    // The stale failure must NOT revert the cell to "Bee" — Cid stands.
    await waitFor(() => expect(input().value).toBe("Cid"))
  })

  it("does not commit an invalid numeric draft (D4)", async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={numericPayload()} />
      </SectionTableProvider>,
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "abc" } })
    fireEvent.blur(input)

    expect(commit).not.toHaveBeenCalled()
    // The invalid draft is rejected back to the last committed value.
    await waitFor(() => expect(input.value).toBe("10"))
  })

  it("does not commit an unchanged numeric value (D4)", () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={numericPayload()} />
      </SectionTableProvider>,
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "10" } }) // same as committed
    fireEvent.blur(input)

    expect(commit).not.toHaveBeenCalled()
  })

  it("Escape cancels the edit without committing (D4)", async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionTableProvider onCellCommit={commit}>
        <SectionTableRenderer props={payload()} />
      </SectionTableProvider>,
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    input.focus() // so the handler's blur() actually fires a blur event
    fireEvent.change(input, { target: { value: "Zed" } })
    fireEvent.keyDown(input, { key: "Escape" })

    expect(commit).not.toHaveBeenCalled()
    await waitFor(() => expect(input.value).toBe("Ada"))
  })
})
