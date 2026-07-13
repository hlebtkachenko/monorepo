import type { Meta, StoryObj } from "@storybook/react"

import { SectionTitleRenderer } from "./section-title"

/**
 * `SectionTitle` is a standalone `h2` group heading — placed above 2+ Form
 * sections to group them. Same left position/padding as a Form section's title.
 */
const meta = {
  title: "Blocks/Content Panel/SectionTitle",
  component: SectionTitleRenderer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SectionTitleRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { props: { title: "Company" } },
}
