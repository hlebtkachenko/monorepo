import type { Meta, StoryObj } from "@storybook/react"

import { GroupFrame } from "./section-group"

/**
 * `SectionGroup` brackets a set of sections with a top + bottom rule and an
 * optional `h2` heading. Its nested sections are rendered by `SectionList` and
 * passed to `GroupFrame` as children — shown here with placeholder content.
 */
const meta = {
  title: "Blocks/Content Panel/SectionGroup",
  component: GroupFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof GroupFrame>

export default meta
type Story = StoryObj<typeof meta>

export const Titled: Story = {
  args: {
    title: "Company",
    children: (
      <div className="px-6 pb-8 text-sm text-muted-foreground">…sections…</div>
    ),
  },
}

export const Untitled: Story = {
  args: {
    children: (
      <div className="px-6 py-8 text-sm text-muted-foreground">…sections…</div>
    ),
  },
}
