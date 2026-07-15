"use client"

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorEditProvider } from "./inspector-edit-context"
import {
  InspectorKeyDetails,
  type InspectorKeyLine,
} from "./inspector-key-details"

function renderKeyDetails(lines: InspectorKeyLine[], editing = false) {
  return render(
    <IconProvider>
      <InspectorEditProvider editing={editing}>
        <InspectorKeyDetails lines={lines} />
      </InspectorEditProvider>
    </IconProvider>,
  )
}

describe("InspectorKeyDetails", () => {
  it("renders labels and values as plain text when idle", () => {
    renderKeyDetails([{ label: "Partner", value: "Acme s.r.o." }])
    expect(screen.getByText("Partner")).toBeInTheDocument()
    expect(screen.getByText("Acme s.r.o.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("swaps a value to an input on click and commits live", () => {
    const onChange = vi.fn()
    renderKeyDetails([{ label: "Partner", value: "Acme", onChange }])

    fireEvent.click(screen.getByRole("button", { name: "Acme" }))
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "Globex" } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith("Globex")
    expect(screen.getByText("Globex")).toBeInTheDocument()
  })

  it("folds every editable line open under global edit, read-only stays static", () => {
    renderKeyDetails(
      [
        { label: "Partner", value: "Acme" },
        { label: "VAT", value: 21, type: "number", readOnly: true },
      ],
      true,
    )
    // The editable line is an input with no click needed.
    expect(screen.getByRole("textbox")).toHaveValue("Acme")
    // The read-only line stays static text (never an input).
    expect(screen.getByText("21").closest("input")).toBeNull()
  })

  it("keeps read-only lines static (not a button)", () => {
    renderKeyDetails([
      { label: "VAT", value: 21, type: "number", readOnly: true },
    ])
    expect(screen.getByText("21").closest("button")).toBeNull()
  })

  it("shows the placeholder for an empty editable line", () => {
    renderKeyDetails([
      { label: "Project", value: "", placeholder: "Assign a project…" },
    ])
    expect(screen.getByText("Assign a project…")).toBeInTheDocument()
  })
})
