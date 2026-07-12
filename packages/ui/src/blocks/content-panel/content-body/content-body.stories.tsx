import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { archetypeEmpty } from "./archetypes/archetype-empty"
import { ContentBody } from "./content-body"

/**
 * `ContentBody` is the archetype-blocked scrolling body of the Content Panel. It
 * accepts only a branded `ArchetypeDescriptor` from a closed factory (here
 * `archetypeEmpty(...)`), never bespoke JSX.
 */
const meta = {
  title: "Blocks/Content Panel/ContentBody",
  component: ContentBody,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-svh p-4">
          <div className="h-full overflow-hidden rounded-md border border-border-subtle bg-shell-surface">
            <Story />
          </div>
        </div>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof ContentBody>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    body: archetypeEmpty({
      title: "No documents yet",
      description: "Imported invoices will appear here.",
    }),
  },
}

export const EmptyWithIcon: Story = {
  args: {
    body: archetypeEmpty({
      icon: "Inbox",
      title: "No documents yet",
      description: "Imported invoices will appear here.",
    }),
  },
}
