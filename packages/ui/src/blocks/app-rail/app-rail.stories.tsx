import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppRail, type RailMenuEntry } from "./app-rail"

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

const items: RailMenuEntry[] = [
  { label: "Company", icon: "Goal", href: "/acme" },
  "separator",
  { label: "Accounting", icon: "SwatchBook", href: "/acme/accounting" },
  { label: "Documents", icon: "FolderBookmark", href: "/acme/documents" },
  {
    label: "Finance",
    icon: "PiggyBank",
    href: "/acme/finance",
    iconSize: 24,
    iconStrokeWidth: 1.5,
  },
  "separator",
  { label: "Settings", icon: "Settings", href: "/acme/settings" },
]

export const Expanded: Story = {
  render: () => (
    <div className="h-svh w-[60px] bg-canvas">
      <AppRail
        items={items}
        currentPath="/acme/accounting"
        defaultMode="expanded"
      />
    </div>
  ),
}

export const IconOnly: Story = {
  render: () => (
    <div className="h-svh w-[50px] bg-canvas">
      <AppRail
        items={items}
        currentPath="/acme/accounting"
        defaultMode="icon-only"
      />
    </div>
  ),
}
