import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionForm } from "./section-form"
import { SectionFormRenderer } from "./section-form-renderer"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("sectionForm factory", () => {
  it("mints a branded `form` descriptor the guard accepts", () => {
    const descriptor = sectionForm({ title: "Legal identity", fields: [] })
    expect(descriptor.kind).toBe("form")
    expect(isSectionDescriptor(descriptor)).toBe(true)
  })

  it("lifts `anchor` onto the descriptor, not into props", () => {
    const descriptor = sectionForm({
      title: "Legal identity",
      anchor: "legal-identity",
      fields: [],
    })
    expect(descriptor.anchor).toBe("legal-identity")
    expect(descriptor.props).not.toHaveProperty("anchor")
  })
})

describe("SectionFormRenderer", () => {
  it("renders the group title and description", () => {
    wrap(
      <SectionFormRenderer
        props={{
          title: "Legal identity",
          description: "How this účetní jednotka is named on filings.",
          fields: [],
        }}
      />,
    )
    expect(screen.getByText("Legal identity")).toBeInTheDocument()
    expect(
      screen.getByText("How this účetní jednotka is named on filings."),
    ).toBeInTheDocument()
  })

  it("renders a text field with its label and value", () => {
    wrap(
      <SectionFormRenderer
        props={{
          title: "Legal identity",
          fields: [
            {
              label: "Legal name",
              name: "legal_name",
              control: { kind: "text", value: "Developer Workspace" },
            },
          ],
        }}
      />,
    )
    const input = screen.getByLabelText<HTMLInputElement>("Legal name")
    expect(input).toHaveValue("Developer Workspace")
  })

  it("renders a select field (Radix trigger) showing its default value", () => {
    wrap(
      <SectionFormRenderer
        props={{
          title: "Registered capital & size",
          fields: [
            {
              label: "Currency",
              name: "currency",
              control: {
                kind: "select",
                value: "CZK",
                placeholder: "Select…",
                options: [
                  { label: "CZK", value: "CZK" },
                  { label: "EUR", value: "EUR" },
                ],
              },
            },
          ],
        }}
      />,
    )
    // Our desktop control is the Radix Select (a combobox button), not a native
    // <select>; options render in a portal only once opened. Assert the trigger
    // is labelled and shows the default value.
    const trigger = screen.getByLabelText("Currency")
    expect(trigger).toHaveAttribute("role", "combobox")
    expect(trigger).toHaveTextContent("CZK")
  })

  it("maps span to a col-span class and defaults to a full row", () => {
    wrap(
      <SectionFormRenderer
        props={{
          title: "Legal identity",
          fields: [
            { label: "Narrow", control: { kind: "text" }, span: 2 },
            { label: "Default", control: { kind: "text" } },
          ],
        }}
      />,
    )
    const narrow = screen
      .getByLabelText("Narrow")
      .closest('[data-slot="field"]')
    const wide = screen.getByLabelText("Default").closest('[data-slot="field"]')
    expect(narrow).toHaveClass("sm:col-span-2")
    expect(wide).toHaveClass("col-span-6")
    expect(wide).not.toHaveClass("sm:col-span-2")
  })
})
