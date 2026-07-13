import type { Meta, StoryObj } from "@storybook/react"

import { SectionDividerRenderer } from "./section-divider"

/**
 * `SectionDivider` is a full-ContentBody-width hairline the page places to
 * bracket a group of sections (above the Title, and below the group's last
 * section).
 */
const meta = {
  title: "Blocks/Content Panel/SectionDivider",
  component: SectionDividerRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="py-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionDividerRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { props: {} },
}
