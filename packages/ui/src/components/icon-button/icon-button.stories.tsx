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
