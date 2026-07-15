import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionDetailsForm } from "./section-details-form"
import { SectionDetailsFormRenderer } from "./section-details-form-renderer"
import { isSectionDescriptor } from "./section"
import { SectionActionProvider } from "./section-action-context"

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

  it("renders semantic status inputs with success and failure icons", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Signing",
          fields: [
            {
              label: "Saved signature",
              name: "saved_signature",
              control: { kind: "status", value: "Saved", tone: "success" },
            },
            {
              label: "Missing signature",
              name: "missing_signature",
              control: {
                kind: "status",
                value: "Not added",
                tone: "destructive",
              },
            },
          ],
        }}
      />,
    )

    const saved = screen.getByLabelText<HTMLInputElement>("Saved signature")
    const missing = screen.getByLabelText<HTMLInputElement>("Missing signature")
    expect(saved).toHaveValue("Saved")
    expect(saved.parentElement?.querySelector("svg")).toHaveClass(
      "text-success",
    )
    expect(missing).toHaveValue("Not added")
    expect(missing.parentElement?.querySelector("svg")).toHaveClass(
      "text-destructive",
    )
  })

  it("renders a creatable combobox and dispatches a selected option", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    wrap(
      <SectionActionProvider onAction={onAction}>
        <SectionDetailsFormRenderer
          props={{
            title: "Company structure",
            fields: [
              {
                label: "Department",
                name: "department",
                control: {
                  kind: "creatable-combobox",
                  value: "Finance",
                  options: [
                    { label: "Finance", value: "Finance" },
                    { label: "Audit", value: "Audit" },
                  ],
                  changeActionId: "department.changed",
                },
              },
            ],
          }}
        />
      </SectionActionProvider>,
    )

    const input = screen.getByLabelText("Department")
    expect(input).toHaveValue("Finance")
    await user.click(input)
    await user.clear(input)
    await user.type(input, "Audit")
    await user.click(await screen.findByText("Audit"))
    expect(onAction).toHaveBeenCalledWith({
      id: "department.changed",
      payload: "Audit",
    })
  })

  it("renders an action field as a navigation button", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Security",
          fields: [
            {
              label: "Two-factor authentication",
              control: {
                kind: "action",
                label: "Set up two-factor",
                href: "/auth/mfa/setup",
              },
            },
          ],
        }}
      />,
    )

    expect(
      screen.getByRole("link", { name: "Set up two-factor" }),
    ).toHaveAttribute("href", "/auth/mfa/setup")
  })

  it("renders a labelled phone input with its normalized form value", async () => {
    const user = userEvent.setup()
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Contact",
          fields: [
            {
              label: "Phone",
              name: "phone",
              control: { kind: "phone", defaultCountry: "CZ" },
            },
          ],
        }}
      />,
    )

    const input = screen.getByLabelText<HTMLInputElement>("Phone")
    expect(input).toHaveAttribute("name", "phone")
    expect(input).toHaveAttribute("type", "tel")

    await user.type(input, "1")
    expect(input).toHaveValue("+420 1")
  })

  it("dispatches the phone input's normalized value", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    wrap(
      <SectionActionProvider onAction={onAction}>
        <SectionDetailsFormRenderer
          props={{
            title: "Contact",
            fields: [
              {
                label: "Phone",
                name: "phone",
                control: {
                  kind: "phone",
                  defaultCountry: "CZ",
                  changeActionId: "phone.changed",
                },
              },
            ],
          }}
        />
      </SectionActionProvider>,
    )

    await user.type(screen.getByLabelText("Phone"), "777")

    expect(onAction).toHaveBeenLastCalledWith({
      id: "phone.changed",
      payload: "+420777",
    })
  })

  it("renders an avatar preview", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Identity",
          fields: [
            {
              label: "Avatar",
              control: {
                kind: "avatar",
                alt: "Ada Lovelace",
                fallback: "AL",
              },
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("AL")).toBeInTheDocument()
  })

  it("renders a croppable image picker with normal action buttons", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Profile photo",
          fields: [
            {
              label: "Avatar",
              control: {
                kind: "image-upload",
                alt: "Ada Lovelace",
                fallback: "AL",
                changeActionId: "avatar.changed",
                removeActionId: "avatar.removed",
              },
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Choose photo" }),
    ).toHaveAttribute("data-size", "default")
    expect(
      screen.getByRole("button", { name: "Choose photo" }).parentElement,
    ).toHaveClass("flex-col")
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

  it("maps span and row-start options to grid classes", () => {
    wrap(
      <SectionDetailsFormRenderer
        props={{
          title: "Legal identity",
          fields: [
            {
              label: "Narrow",
              control: { kind: "text" },
              span: 2,
              startNewRow: true,
            },
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
    expect(narrow).toHaveClass("@xl/section:col-start-1")
    expect(wide).toHaveClass("col-span-6")
    expect(wide).not.toHaveClass("@xl/section:col-span-2")
  })
})
