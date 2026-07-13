import type { Meta, StoryObj } from "@storybook/react"

import { SectionSpaceRenderer } from "./section-space"

/**
 * `SectionSpace` is a pure vertical gap between sections (e.g. before the first
 * section). Natural-height, per-page configurable via `size`.
 */
const meta = {
  title: "Blocks/Content Panel/SectionSpace",
  component: SectionSpaceRenderer,
  decorators: [
    (Story) => (
      <div className="bg-muted">
        <div className="h-4 bg-primary/20" />
        <Story />
        <div className="h-4 bg-primary/20" />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionSpaceRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { props: { size: 32 } },
}

export const Large: Story = {
  args: { props: { size: 48 } },
}
