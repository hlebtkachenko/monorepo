import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ArchetypeEmptyRenderer } from "./archetype-empty"

/**
 * `ArchetypeEmpty` is the first archetype — a chrome-agnostic, full-height
 * centred empty state composed from the `Empty*` primitives.
 */
const meta = {
  title: "Blocks/Content Panel/ArchetypeEmpty",
  component: ArchetypeEmptyRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-svh p-4">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof ArchetypeEmptyRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const TitleOnly: Story = {
  args: { props: { title: "No documents yet" } },
}

export const TitleAndDescription: Story = {
  args: {
    props: {
      title: "No documents yet",
      description: "Imported invoices will appear here.",
    },
  },
}

export const TitleWithIcon: Story = {
  args: {
    props: {
      icon: "Inbox",
      title: "No documents yet",
      description: "Imported invoices will appear here.",
    },
  },
}
