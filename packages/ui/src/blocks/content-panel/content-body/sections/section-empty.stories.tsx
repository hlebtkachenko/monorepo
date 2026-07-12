import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionEmptyRenderer } from "./section-empty"

/**
 * `SectionEmpty` is the reusable body-part proof — a full-height centred
 * placeholder Section that composes inside an archetype body.
 */
const meta = {
  title: "Blocks/Content Panel/SectionEmpty",
  component: SectionEmptyRenderer,
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
} satisfies Meta<typeof SectionEmptyRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { props: {} },
}

export const Titled: Story = {
  args: { props: { title: "Line items" } },
}
