import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionFormRenderer } from "./section-form-renderer"

/**
 * `SectionForm` is a two-column form group: a title + description block on the
 * left, a 6-column field grid on the right. Fields declare their own span
 * (1–6) and wrap; the grid never constrains which control a field carries.
 */
const meta = {
  title: "Blocks/Content Panel/SectionForm",
  component: SectionFormRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof SectionFormRenderer>

export default meta
type Story = StoryObj<typeof meta>

/** Reproduces the "Legal identity" group from org settings. */
export const LegalIdentity: Story = {
  args: {
    props: {
      title: "Legal identity",
      description: "How this účetní jednotka is named on filings and výkazy.",
      fields: [
        {
          label: "Legal name",
          name: "legal_name",
          span: 4,
          control: { kind: "text", value: "Developer Workspace" },
        },
        {
          label: "Legal form",
          name: "legal_form",
          span: 2,
          control: {
            kind: "select",
            placeholder: "Not set",
            options: [
              { label: "s.r.o.", value: "sro" },
              { label: "a.s.", value: "as" },
            ],
          },
        },
        {
          label: "IČO",
          name: "ico",
          span: 2,
          control: {
            kind: "text",
            placeholder: "00000000",
            inputMode: "numeric",
          },
        },
        {
          label: "DIČ",
          name: "dic",
          span: 2,
          control: { kind: "text", placeholder: "—", disabled: true },
          hover: {
            title: "DIČ — daňové identifikační číslo",
            description:
              "Issued by the finanční úřad for every company, even non-VAT payers, and required when dealing with the FÚ.",
          },
        },
        {
          label: "Person kind",
          name: "person_kind",
          span: 2,
          control: { kind: "text", value: "legal_entity", disabled: true },
        },
      ],
    },
  },
}

/** Reproduces the "Registered capital & size" group from org settings. */
export const RegisteredCapital: Story = {
  args: {
    props: {
      title: "Registered capital & size",
      description:
        "Základní kapitál and the accounting size category — drives which výkazy apply.",
      fields: [
        {
          label: "Registered capital",
          name: "capital",
          span: 2,
          control: { kind: "text", placeholder: "0", inputMode: "numeric" },
        },
        {
          label: "Currency",
          name: "currency",
          span: 2,
          control: {
            kind: "select",
            value: "CZK",
            options: [
              { label: "CZK", value: "CZK" },
              { label: "EUR", value: "EUR" },
            ],
          },
        },
        {
          label: "Size category",
          name: "size_category",
          span: 2,
          control: {
            kind: "select",
            placeholder: "Select…",
            options: [
              { label: "Micro", value: "micro" },
              { label: "Small", value: "small" },
            ],
          },
        },
        {
          label: "Employees",
          name: "employees",
          span: 2,
          control: { kind: "text", placeholder: "0", inputMode: "numeric" },
        },
        {
          label: "NACE (main activity)",
          name: "nace",
          span: 4,
          control: { kind: "select", placeholder: "Select code…" },
        },
      ],
    },
  },
}

/** Shows the grid capability: row 1 = 2 + 1 + 3, row 2 = 2 + 4. */
export const SpanShowcase: Story = {
  args: {
    props: {
      title: "Span showcase",
      description: "Each field declares 1–6 columns and wraps within the grid.",
      fields: [
        { label: "Span 2", span: 2, control: { kind: "text" } },
        { label: "Span 1", span: 1, control: { kind: "text" } },
        { label: "Span 3", span: 3, control: { kind: "text" } },
        { label: "Span 2", span: 2, control: { kind: "text" } },
        { label: "Span 4", span: 4, control: { kind: "text" } },
      ],
    },
  },
}
