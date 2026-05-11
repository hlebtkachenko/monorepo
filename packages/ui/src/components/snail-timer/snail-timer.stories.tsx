import type { Meta, StoryObj } from "@storybook/react"
import { SnailTimer } from "./snail-timer"

const meta: Meta<typeof SnailTimer> = {
  title: "Components/SnailTimer",
  component: SnailTimer,
}
export default meta
type Story = StoryObj<typeof SnailTimer>

export const Default: Story = {
  render: () => (
    <div className="w-[480px] rounded-lg border border-border p-6">
      <SnailTimer initialSeconds={20} />
    </div>
  ),
}

export const Short: Story = {
  render: () => (
    <div className="w-[480px] rounded-lg border border-border p-6">
      <SnailTimer initialSeconds={5} />
    </div>
  ),
}

export const Long: Story = {
  render: () => (
    <div className="w-[480px] rounded-lg border border-border p-6">
      <SnailTimer initialSeconds={60} />
    </div>
  ),
}
