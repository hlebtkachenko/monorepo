import type { Meta, StoryObj } from "@storybook/react"

import { AssistantPanel } from "./assistant-panel"

const meta = {
  title: "Blocks/Assistant Panel/AssistantPanel",
  component: AssistantPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-96 w-80 border border-border-subtle bg-shell-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SidekickLabel: Story = {
  args: { label: "Sidekick" },
}

export const CustomBody: Story = {
  render: () => (
    <AssistantPanel>
      <div className="text-foreground">Custom assistant surface</div>
    </AssistantPanel>
  ),
}
