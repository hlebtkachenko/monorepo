import type { Meta, StoryObj } from "@storybook/react"
import { SeparatorExtended } from "./separator-extended"

const meta: Meta<typeof SeparatorExtended> = {
  title: "Components/SeparatorExtended",
  component: SeparatorExtended,
}
export default meta
type Story = StoryObj<typeof SeparatorExtended>

export const Default: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <SeparatorExtended />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const Dashed: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <SeparatorExtended variant="dashed" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const Dotted: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <SeparatorExtended variant="dotted" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const Double: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Above</p>
      <SeparatorExtended variant="double" />
      <p className="text-sm">Below</p>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div className="flex h-12 items-center gap-3">
      <span className="text-sm">Left</span>
      <SeparatorExtended orientation="vertical" variant="dashed" />
      <span className="text-sm">Middle</span>
      <SeparatorExtended orientation="vertical" variant="dotted" />
      <span className="text-sm">Right</span>
    </div>
  ),
}
