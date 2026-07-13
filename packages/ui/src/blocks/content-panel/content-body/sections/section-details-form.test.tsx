import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionDetailsForm } from "./section-details-form"
import { SectionDetailsFormRenderer } from "./section-details-form-renderer"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("sectionDetailsForm factory", () => {
  it("mints a branded `details-form` descriptor the guard accepts", () => {
    const descriptor = sectionDetailsForm({
      title: "Legal identity",
      fields: [],
    })
    expect(descriptor.kind).toBe("details-form")
    expect(isSectionDescriptor(descriptor)).toBe(true)
  })

  it("lifts `anchor` onto the descriptor, not into props", () => {
    const descriptor = sectionDetailsForm({
      title: "Legal identity",
      anchor: "legal-identity",
      fields: [],
    })
    expect(descriptor.anchor).toBe("legal-identity")
    expect(descriptor.props).not.toHaveProperty("anchor")
  })
})

describe("SectionDetailsFormRenderer", () => {
  it("renders the group title and description", () => {
    wrap(
      <SectionDetailsFormRenderer
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
      <SectionDetailsFormRenderer
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
      <SectionDetailsFormRenderer
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

  it("shows a '?' HoverCard trigger by the label (not on the control) when `hover` is set", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Legal identity",
          fields: [
            {
              label: "DIČ",
              name: "dic",
              control: { kind: "text", disabled: true },
              hover: { title: "DIČ", description: "Issued by the FÚ." },
            },
            { label: "IČO", name: "ico", control: { kind: "text" } },
          ],
        }}
      />,
    )
    // The trigger is a visible "?" button, keyed to the field, not the input.
    const trigger = screen.getByRole("button", { name: "About DIČ" })
    expect(trigger).toHaveAttribute("data-slot", "hover-card-trigger")
    expect(trigger).not.toContainElement(screen.getByLabelText("DIČ"))
    // Exactly one trigger — the field without `hover` gets none.
    expect(screen.getAllByRole("button", { name: /^About / })).toHaveLength(1)
  })

  it("maps span to a col-span class and defaults to a full row", () => {
    wrap(
      <SectionDetailsFormRenderer
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
    expect(narrow).toHaveClass("@xl/section:col-span-2")
    expect(wide).toHaveClass("col-span-6")
    expect(wide).not.toHaveClass("@xl/section:col-span-2")
  })
})
