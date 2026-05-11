import type { Meta, StoryObj } from "@storybook/react"
import { ColorSwatch } from "./color-swatch"

const meta: Meta<typeof ColorSwatch> = {
  title: "Components/ColorSwatch",
  component: ColorSwatch,
}
export default meta
type Story = StoryObj<typeof ColorSwatch>

export const Default: Story = {
  args: { color: "#3b82f6" },
}

export const SizeSm: Story = {
  args: { color: "#10b981", size: "sm" },
}

export const SizeLg: Story = {
  args: { color: "#ef4444", size: "lg" },
}

export const Transparency: Story = {
  args: { color: "rgba(255, 0, 0, 0.5)" },
}

export const TransparentToken: Story = {
  args: { color: "transparent" },
}

export const Disabled: Story = {
  args: { color: "#22c55e", disabled: true },
}

export const NoColor: Story = {
  args: {},
}

export const InvalidColor: Story = {
  args: { color: "not-a-color" },
}

export const TokenColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ColorSwatch color="var(--primary)" />
      <ColorSwatch color="var(--success)" />
      <ColorSwatch color="var(--warning)" />
      <ColorSwatch color="var(--info)" />
      <ColorSwatch color="var(--destructive)" />
      <ColorSwatch color="var(--chart-1)" />
      <ColorSwatch color="var(--chart-2)" />
      <ColorSwatch color="var(--chart-3)" />
    </div>
  ),
}
