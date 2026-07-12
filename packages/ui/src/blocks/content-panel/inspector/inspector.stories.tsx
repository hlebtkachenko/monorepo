import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { Inspector } from "./inspector"

const meta = {
  title: "Blocks/Content Panel/Inspector",
  component: Inspector,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="flex h-96 w-[720px] border border-border-subtle bg-shell-surface">
          <div className="flex-1 p-3 text-sm text-muted-foreground">
            Body content
          </div>
          <Story />
        </div>
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof Inspector>

export default meta
type Story = StoryObj<typeof meta>

const detail = (
  <div className="text-sm">Detail of the selected record — fields go here.</div>
)

export const Panel: Story = {
  args: { open: true, mode: "panel", title: "FP-2026-0001", children: detail },
}

export const PanelClosable: Story = {
  args: {
    open: true,
    mode: "panel",
    title: "FP-2026-0001",
    onOpenChange: () => {},
    children: detail,
  },
}

export const DialogMode: Story = {
  args: {
    open: true,
    mode: "dialog",
    title: "FP-2026-0001",
    onOpenChange: () => {},
    children: detail,
  },
}

export const Closed: Story = {
  args: { open: false, children: detail },
}
