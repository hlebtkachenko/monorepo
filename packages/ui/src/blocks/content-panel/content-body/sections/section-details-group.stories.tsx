import type { Meta, StoryObj } from "@storybook/react"

import { DetailsGroupFrame } from "./section-details-group"

/**
 * `SectionDetailsGroup` brackets a set of sections with a top + bottom rule and
 * an optional `h2` heading. Its nested sections are rendered by `SectionList` and
 * passed to `DetailsGroupFrame` as children — shown here with placeholder content.
 */
const meta = {
  title: "Blocks/Content Panel/SectionDetailsGroup",
  component: DetailsGroupFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DetailsGroupFrame>

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
