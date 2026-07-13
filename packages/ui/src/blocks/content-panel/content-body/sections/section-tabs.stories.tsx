import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionTabsRenderer } from "./section-tabs-renderer"

/**
 * `SectionTabs` is a Form section whose right column is a set of tabs (default
 * segmented variant); each tab holds its own field grid.
 */
const meta = {
  title: "Blocks/Content Panel/SectionTabs",
  component: SectionTabsRenderer,
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
} satisfies Meta<typeof SectionTabsRenderer>

export default meta
type Story = StoryObj<typeof meta>

const address = (prefix: string) => [
  {
    label: "Street",
    name: `${prefix}_street`,
    span: 6 as const,
    control: { kind: "text" as const, placeholder: "Ulice" },
  },
  {
    label: "City",
    name: `${prefix}_city`,
    span: 3 as const,
    control: { kind: "text" as const },
  },
  {
    label: "Postal code",
    name: `${prefix}_zip`,
    span: 3 as const,
    control: { kind: "text" as const },
  },
]

export const Addresses: Story = {
  args: {
    props: {
      title: "Addresses",
      description:
        "Sídlo prints on every přiznání and výkaz. Mailing and establishment are optional.",
      tabs: [
        {
          id: "sidlo",
          label: "Registered seat (sídlo)",
          fields: address("sidlo"),
        },
        { id: "mail", label: "Mailing address", fields: address("mail") },
        { id: "prov", label: "Provozovna", fields: address("prov") },
      ],
    },
  },
}
