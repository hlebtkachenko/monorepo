import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentBody } from "./content-body"
import { sectionEmpty } from "./sections/section-empty"

/**
 * `ContentBody` is the body region of the Content Panel. It renders a list of
 * branded `Section` descriptors from a closed factory (here `sectionEmpty(...)`)
 * through the closed `SECTION_REGISTRY`, never bespoke JSX.
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

export const EmptySection: Story = {
  args: {
    sections: [sectionEmpty({ title: "No documents yet" })],
  },
}

export const StackedSections: Story = {
  args: {
    sections: [
      sectionEmpty({ title: "First section" }),
      sectionEmpty({ title: "Second section" }),
    ],
  },
}
