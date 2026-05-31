import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"
import { BookOpenText, FolderOpen, PiggyBank } from "@workspace/ui/lib/icons"

import { AppRail } from "./app-rail"

const meta: Meta<typeof AppRail> = {
  title: "Blocks/AppRail",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <Story />
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof AppRail>

const items = [
  {
    key: "accounting",
    label: "Accounting",
    icon: <BookOpenText className="size-5" />,
    active: true,
  },
  {
    key: "documents",
    label: "Documents",
    icon: <FolderOpen className="size-5" />,
  },
  {
    key: "finance",
    label: "Finance",
    icon: <PiggyBank className="size-5" />,
  },
]

export const Expanded: Story = {
  render: () => (
    <div className="h-svh w-[240px] bg-canvas">
      <AppRail items={items} defaultMode="expanded" />
    </div>
  ),
}

export const IconOnly: Story = {
  render: () => (
    <div className="h-svh w-[60px] bg-canvas">
      <AppRail items={items} defaultMode="icon-only" />
    </div>
  ),
}
