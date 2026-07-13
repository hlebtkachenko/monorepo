import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionDetailsTableRenderer } from "./section-details-table-renderer"

/**
 * `SectionDetailsTable` is the Details Form section with its right column swapped
 * for a data-driven table plus action buttons below. `readonly` shows display
 * cells and lets "+ New" append editable rows; `editable` renders every row as
 * inputs.
 */
const meta = {
  title: "Blocks/Content Panel/SectionDetailsTable",
  component: SectionDetailsTableRenderer,
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
} satisfies Meta<typeof SectionDetailsTableRenderer>

export default meta
type Story = StoryObj<typeof meta>

/** Reproduces the "Bank accounts" table from the sketch — readonly + New/Import. */
export const BankAccounts: Story = {
  args: {
    props: {
      title: "Bank accounts",
      description:
        "Used on invoices and for párování plateb. The primary account prints by default.",
      mode: "readonly",
      columns: [
        { id: "iban", header: "IBAN", display: { kind: "mono" } },
        { id: "bank", header: "Bank" },
        {
          id: "currency",
          header: "Currency",
          display: { kind: "badge", tone: "neutral" },
        },
        {
          id: "primary",
          header: "Primary",
          align: "end",
          display: { kind: "badge-or-dash", tone: "success" },
        },
      ],
      rows: [
        {
          id: "cs",
          cells: {
            iban: "CZ65 0800 0000 1920 0014 5399",
            bank: "Česká spořitelna",
            currency: "CZK",
            primary: "Primary",
          },
        },
        {
          id: "fio",
          cells: {
            iban: "CZ12 2010 0000 0029 0148 1234",
            bank: "Fio banka",
            currency: "EUR",
            primary: "",
          },
        },
      ],
      actions: [
        { id: "new", label: "New", icon: "add" },
        {
          id: "import",
          label: "Import from Excel",
          icon: "import",
          behavior: "link",
          href: "?import=bank-accounts",
        },
      ],
    },
  },
}

/** An editable table — every row is inputs; "+ Add person" appends a blank row. */
export const EditableContacts: Story = {
  args: {
    props: {
      title: "Contact people",
      description:
        "Statutory representatives and daily contacts. Edited inline; saved with the page.",
      mode: "editable",
      name: "contacts",
      columns: [
        { id: "name", header: "Name", edit: { kind: "text" } },
        {
          id: "role",
          header: "Role",
          edit: {
            kind: "select",
            placeholder: "Select…",
            options: [
              { label: "Jednatel", value: "jednatel" },
              { label: "Účetní", value: "ucetni" },
              { label: "Kontakt", value: "kontakt" },
            ],
          },
        },
        {
          id: "email",
          header: "Email",
          edit: { kind: "text", placeholder: "name@example.cz" },
        },
      ],
      rows: [
        {
          id: "r1",
          cells: { name: "Jan Novák", role: "jednatel", email: "jan@acme.cz" },
        },
      ],
      actions: [{ id: "add", label: "Add person", icon: "add" }],
    },
  },
}
