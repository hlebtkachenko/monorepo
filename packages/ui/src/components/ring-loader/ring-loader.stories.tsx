import type { Meta, StoryObj } from "@storybook/react"
import { RingLoader } from "./ring-loader"

const meta: Meta<typeof RingLoader> = {
  title: "Components/RingLoader",
  component: RingLoader,
}
export default meta
type Story = StoryObj<typeof RingLoader>

export const Default: Story = {}

export const Large: Story = {
  args: { className: "size-10" },
}

export const Primary: Story = {
  args: { className: "size-8 text-primary" },
}

export const Destructive: Story = {
  args: { className: "size-8 text-destructive" },
}

export const Slow: Story = {
  args: {
    style: { "--duration": "3s" } as React.CSSProperties,
    className: "size-10",
  },
}
