"use client"

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorEditProvider } from "./inspector-edit-context"
import { InspectorParagraph } from "./inspector-paragraph"

function renderParagraph(
  editing: boolean,
  props: Partial<React.ComponentProps<typeof InspectorParagraph>> = {},
) {
  return render(
    <IconProvider>
      <InspectorEditProvider editing={editing}>
        <InspectorParagraph title="AI summary" {...props}>
          {props.children ?? <p>Hello world</p>}
        </InspectorParagraph>
      </InspectorEditProvider>
    </IconProvider>,
  )
}

describe("InspectorParagraph", () => {
  it("renders the title and prose read-only", () => {
    renderParagraph(false)
    expect(screen.getByText("AI summary")).toBeInTheDocument()
    expect(screen.getByText("Hello world")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("swaps to a textarea in edit mode when onChange is supplied", () => {
    const onChange = vi.fn()
    renderParagraph(true, { editValue: "Draft text", onChange })
    const box = screen.getByRole("textbox")
    expect(box).toHaveValue("Draft text")
    fireEvent.change(box, { target: { value: "Edited" } })
    expect(onChange).toHaveBeenCalledWith("Edited")
  })

  it("stays read-only in edit mode without onChange", () => {
    renderParagraph(true)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("renders the footer slot", () => {
    renderParagraph(false, { footer: <button>Submit</button> })
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument()
  })
})
