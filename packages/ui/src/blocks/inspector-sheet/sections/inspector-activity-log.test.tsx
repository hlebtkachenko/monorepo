"use client"

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import {
  InspectorActivityLog,
  type InspectorActivityLogEntry,
} from "./inspector-activity-log"

function renderLog(entries: InspectorActivityLogEntry[]) {
  return render(
    <IconProvider>
      <InspectorActivityLog title="Activity" entries={entries} />
    </IconProvider>,
  )
}

describe("InspectorActivityLog", () => {
  it("renders before / after / when / by for each change", () => {
    renderLog([
      {
        id: "1",
        field: "Total",
        before: "12 000 Kč",
        after: "12 400 Kč",
        when: "10:16",
        by: "Jana N.",
      },
    ])
    expect(screen.getByText("Activity")).toBeInTheDocument()
    expect(screen.getByText("Total")).toBeInTheDocument()
    expect(screen.getByText("12 000 Kč")).toBeInTheDocument()
    expect(screen.getByText("12 400 Kč")).toBeInTheDocument()
    expect(screen.getByText("10:16")).toBeInTheDocument()
    expect(screen.getByText("Jana N.")).toBeInTheDocument()
  })

  it("fires Undo for rows that support it", () => {
    const onUndo = vi.fn()
    renderLog([
      {
        id: "1",
        field: "Status",
        before: "Draft",
        after: "Posted",
        when: "10:15",
        by: "You",
        onUndo,
      },
    ])
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it("omits Undo for rows without a handler", () => {
    renderLog([
      { id: "1", field: "Imported", after: "OK", when: "09:41", by: "System" },
    ])
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument()
  })
})
