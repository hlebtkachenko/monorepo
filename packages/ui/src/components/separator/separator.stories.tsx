import type { Meta, StoryObj } from "@storybook/react"
import { Separator } from "./separator"

const meta: Meta<typeof Separator> = {
  title: "Components/Separator",
  component: Separator,
}
export default meta
type Story = StoryObj<typeof Separator>

export const Default: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <Separator />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-2">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Right</span>
    </div>
  ),
}

export const Dashed: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <Separator variant="dashed" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const DashedVertical: Story = {
  render: () => (
    <div className="flex h-12 items-center gap-3">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" variant="dashed" />
      <span className="text-sm">Right</span>
    </div>
  ),
}

export const Dotted: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <Separator variant="dotted" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const DottedVertical: Story = {
  render: () => (
    <div className="flex h-12 items-center gap-3">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" variant="dotted" />
      <span className="text-sm">Right</span>
    </div>
  ),
}

export const Double: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <Separator variant="double" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const DoubleVertical: Story = {
  render: () => (
    <div className="flex h-12 items-center gap-3">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" variant="double" />
      <span className="text-sm">Right</span>
    </div>
  ),
}

export const InNavigation: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium">Home</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-sm font-medium">About</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-sm font-medium">Contact</span>
    </div>
  ),
}
