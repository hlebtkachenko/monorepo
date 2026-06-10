import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { IconButton } from "./icon-button"

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="bg-canvas p-6">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof IconButton>

export const IconOnly: Story = {
  args: { icon: "Inbox", tooltip: "Inbox" },
}

export const Labeled: Story = {
  args: { icon: "Goal", label: "Company" },
}

export const Active: Story = {
  args: { icon: "Goal", label: "Company", active: true },
}

export const Disabled: Story = {
  args: { icon: "Goal", label: "Company", disabled: true },
}

export const AsLink: Story = {
  args: { icon: "Goal", label: "Company", href: "#" },
}

export const LabelPositionBeside: Story = {
  args: { icon: "Goal", label: "Company", labelPosition: "beside" },
}

export const LabelPositionBelow: Story = {
  args: { icon: "Goal", label: "Company", labelPosition: "below" },
}

export const ToneSidekick: Story = {
  args: { icon: "Sparkles", label: "Sidekick", tone: "sidekick" },
}

export const TooltipSideTop: Story = {
  args: { icon: "Inbox", tooltip: "Inbox", tooltipSide: "top" },
}

export const TooltipSideRight: Story = {
  args: { icon: "Inbox", tooltip: "Inbox", tooltipSide: "right" },
}

export const TooltipSideBottom: Story = {
  args: { icon: "Inbox", tooltip: "Inbox", tooltipSide: "bottom" },
}

export const TooltipSideLeft: Story = {
  args: { icon: "Inbox", tooltip: "Inbox", tooltipSide: "left" },
}
