import type { Meta, StoryObj } from "@storybook/react"

import { IconButton } from "@workspace/ui/components/icon-button"
import { IconProvider } from "@workspace/ui/icon-packs"

import { AppHeader } from "./app-header"

const meta: Meta<typeof AppHeader> = {
  title: "Blocks/AppHeader",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-[var(--shell-header-height)] bg-canvas">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof AppHeader>

export const Default: Story = {
  render: () => <AppHeader />,
}

export const WithActions: Story = {
  render: () => (
    <AppHeader
      actions={
        <>
          <IconButton icon="Inbox" tooltip="Inbox" tooltipSide="bottom" />
          <IconButton icon="Settings" tooltip="Settings" tooltipSide="bottom" />
        </>
      }
    />
  ),
}

export const CustomPlaceholder: Story = {
  render: () => <AppHeader searchPlaceholder="Search documents…" />,
}
