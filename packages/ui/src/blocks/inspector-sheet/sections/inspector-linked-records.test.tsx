"use client"

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorEditProvider } from "./inspector-edit-context"
import {
  InspectorLinkedRecords,
  type InspectorLinkedRecord,
} from "./inspector-linked-records"

const ITEMS: InspectorLinkedRecord[] = [
  {
    id: "z",
    relation: "Záloha",
    label: "ZAL-2026-004",
    amount: 5000,
    href: "#",
  },
  { id: "p", relation: "Platba", label: "Bank 2026-03-18", amount: 12400 },
]

function renderLinked(
  editing: boolean,
  props: Partial<React.ComponentProps<typeof InspectorLinkedRecords>> = {},
) {
  return render(
    <IconProvider>
      <InspectorEditProvider editing={editing}>
        <InspectorLinkedRecords title="Vazby" items={ITEMS} {...props} />
      </InspectorEditProvider>
    </IconProvider>,
  )
}

describe("InspectorLinkedRecords", () => {
  it("renders relation badges, labels, and a deep link", () => {
    renderLinked(false)
    expect(screen.getByText("Vazby")).toBeInTheDocument()
    expect(screen.getByText("Záloha")).toBeInTheDocument()
    expect(screen.getByText("ZAL-2026-004")).toBeInTheDocument()
    // href row renders as a link
    expect(screen.getByRole("link")).toBeInTheDocument()
  })

  it("reveals remove + add affordances in edit mode", () => {
    const onRemove = vi.fn()
    const onAdd = vi.fn()
    renderLinked(true, { onRemove, onAdd, addLabel: "Připojit" })

    fireEvent.click(screen.getByRole("button", { name: "Remove ZAL-2026-004" }))
    expect(onRemove).toHaveBeenCalledWith("z")

    fireEvent.click(screen.getByRole("button", { name: "Připojit" }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it("hides remove/add when idle", () => {
    renderLinked(false, { onRemove: vi.fn(), onAdd: vi.fn() })
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument()
  })
})
