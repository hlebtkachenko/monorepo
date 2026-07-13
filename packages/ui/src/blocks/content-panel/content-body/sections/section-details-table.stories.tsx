import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionDetailsTableRenderer } from "./section-details-table-renderer"

/**
 * `SectionDetailsTable` is the Details Form section with its right column swapped
 * for a grid-based table on the same fixed 6-track grid as the form fields. In
 * `editable` mode rows are read-only until their Edit icon flips them to inputs
 * (text / dropdown / tags); Add appends and Delete confirms. `readonly` is pure
 * display.
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

/** Editable bank accounts — text + dropdown columns, Add + Import actions. */
export const BankAccounts: Story = {
  args: {
    props: {
      title: "Bank accounts",
      description:
        "Used on invoices and for párování plateb. Edit inline; saved with the page.",
      mode: "editable",
      name: "bank_accounts",
      columns: [
        { id: "iban", header: "IBAN", span: 2, control: { kind: "text" } },
        { id: "bank", header: "Bank", span: 2, control: { kind: "text" } },
        {
          id: "currency",
          header: "Currency",
          span: 1,
          control: {
            kind: "select",
            options: [
              { label: "CZK", value: "CZK" },
              { label: "EUR", value: "EUR" },
            ],
          },
        },
      ],
      rows: [
        {
          id: "cs",
          cells: {
            iban: "CZ65 0800 0000 1920 0014 5399",
            bank: "Česká spořitelna",
            currency: "CZK",
          },
        },
        {
          id: "fio",
          cells: {
            iban: "CZ12 2010 0000 0029 0148 1234",
            bank: "Fio banka",
            currency: "EUR",
          },
        },
      ],
      addLabel: "Add account",
      actions: [
        {
          id: "import",
          label: "Import from Excel",
          icon: "import",
          href: "?import=bank-accounts",
        },
      ],
      actionsHeader: "Actions",
    },
  },
}

/** Editable contacts — showcases the tags control (Emails) beside text + dropdown. */
export const EditableContacts: Story = {
  args: {
    props: {
      title: "Contact people",
      description:
        "Statutory representatives and daily contacts. Edit inline; saved with the page.",
      mode: "editable",
      name: "contacts",
      columns: [
        { id: "name", header: "Name", span: 2, control: { kind: "text" } },
        {
          id: "role",
          header: "Role",
          span: 1,
          control: {
            kind: "select",
            placeholder: "Select…",
            options: [
              { label: "Jednatel", value: "jednatel" },
              { label: "Účetní", value: "ucetni" },
            ],
          },
        },
        {
          id: "emails",
          header: "Emails",
          span: 2,
          control: { kind: "tags", placeholder: "Add email…" },
        },
      ],
      rows: [
        {
          id: "r1",
          cells: {
            name: "Jan Novák",
            role: "jednatel",
            emails: ["jan@acme.cz"],
          },
        },
      ],
      addLabel: "Add person",
      actions: [],
      actionsHeader: "Actions",
    },
  },
}

/** Read-only — synced data, no Add and no Edit/Delete column. */
export const ReadOnly: Story = {
  args: {
    props: {
      title: "Registrations",
      description:
        "Synced from public registries (ARES, registr plátců DPH). Read-only here.",
      mode: "readonly",
      editHint: {
        text: "To edit these details, go to",
        linkLabel: "Company identity",
        href: "#",
      },
      columns: [
        {
          id: "registry",
          header: "Registry",
          span: 2,
          control: { kind: "text" },
        },
        { id: "number", header: "Number", span: 2, control: { kind: "text" } },
        { id: "status", header: "Status", span: 2, control: { kind: "text" } },
      ],
      rows: [
        {
          id: "or",
          cells: {
            registry: "Obchodní rejstřík",
            number: "C 12345 / MS Praha",
            status: "Active",
          },
        },
      ],
      actions: [],
      actionsHeader: "Actions",
    },
  },
}
