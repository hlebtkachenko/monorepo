import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionTableRenderer } from "./section-table-renderer"

/**
 * `SectionTable` is the full data grid the Table archetype composes — TanStack
 * Table v8 inside the closed renderer, fed pure-data column specs + rows. Columns
 * map to OUR shadcn cells; editable columns become inline `Input` / `Select`
 * editors. Sort · hide · resize · reorder · pin · row-select + cell keyboard
 * navigation come from `DataGridView`; the live instance publishes up to the
 * archetype's toolbar/footer.
 */
const meta = {
  title: "Blocks/Content Panel/SectionTable",
  component: SectionTableRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="flex h-[480px] flex-col border border-border-subtle">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof SectionTableRenderer>

export default meta
type Story = StoryObj<typeof meta>

/** Editable invoices grid — text · select · number columns, a pinned first column. */
export const Invoices: Story = {
  args: {
    props: {
      rowIdKey: "id",
      features: {
        selection: "multi",
        search: true,
        inspect: false,
        rowActions: false,
      },
      columns: [
        {
          id: "document",
          header: "Document",
          kind: "text",
          editable: true,
          pin: "left",
          width: 170,
        },
        {
          id: "partner",
          header: "Partner",
          kind: "text",
          editable: true,
          width: 200,
        },
        {
          id: "status",
          header: "Status",
          kind: "select",
          editable: true,
          enableFilter: true,
          options: [
            { value: "New", label: "New" },
            { value: "Approved", label: "Approved" },
            { value: "Posted", label: "Posted" },
          ],
          width: 150,
        },
        {
          id: "amount",
          header: "Amount",
          kind: "number",
          editable: true,
          align: "end",
          width: 130,
        },
      ],
      rows: [
        {
          id: "1",
          document: "FP-2026-0001",
          partner: "Alza.cz a.s.",
          status: "Posted",
          amount: 12400,
        },
        {
          id: "2",
          document: "FP-2026-0002",
          partner: "ČEZ Prodej s.r.o.",
          status: "Approved",
          amount: 8650,
        },
        {
          id: "3",
          document: "FP-2026-0003",
          partner: "Google Cloud EMEA",
          status: "New",
          amount: 21980,
        },
      ],
    },
  },
}

/** Read-only display grid — no leading select column, no inline editors. */
export const ReadOnly: Story = {
  args: {
    props: {
      rowIdKey: "id",
      features: {
        selection: "none",
        search: true,
        inspect: false,
        rowActions: false,
      },
      columns: [
        { id: "registry", header: "Registry", kind: "text", width: 220 },
        { id: "number", header: "Number", kind: "text", width: 200 },
        {
          id: "status",
          header: "Status",
          kind: "badge",
          options: [{ value: "Active", label: "Active" }],
          width: 140,
        },
      ],
      rows: [
        {
          id: "or",
          registry: "Obchodní rejstřík",
          number: "C 12345 / MS Praha",
          status: "Active",
        },
        {
          id: "dph",
          registry: "Registr plátců DPH",
          number: "CZ12345678",
          status: "Active",
        },
      ],
    },
  },
}
