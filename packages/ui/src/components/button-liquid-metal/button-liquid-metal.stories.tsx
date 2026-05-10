import type { Meta, StoryObj } from "@storybook/react"
import { Sparkles, Zap, ArrowRight } from "lucide-react"
import { LiquidMetalButton } from "./button-liquid-metal"

const meta: Meta<typeof LiquidMetalButton> = {
  title: "Components/ButtonLiquidMetal",
  component: LiquidMetalButton,
}
export default meta

type Story = StoryObj<typeof LiquidMetalButton>

export const Default: Story = {
  args: { children: "Get Started" },
}

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
}

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
}

export const Ghost: Story = {
  args: { children: "Ghost", variant: "ghost" },
}

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
}

export const Link: Story = {
  args: { children: "Link", variant: "link" },
}

export const Small: Story = {
  args: { children: "Small", size: "sm" },
}

export const Large: Story = {
  args: { children: "Large", size: "lg" },
}

export const ExtraSmall: Story = {
  args: { children: "XS", size: "xs" },
}

export const WithIcon: Story = {
  render: () => (
    <LiquidMetalButton>
      <Sparkles />
      Explore
    </LiquidMetalButton>
  ),
}

export const IconOnly: Story = {
  render: () => (
    <LiquidMetalButton size="icon" aria-label="Zap">
      <Zap />
    </LiquidMetalButton>
  ),
}

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <LiquidMetalButton>Default</LiquidMetalButton>
      <LiquidMetalButton variant="outline">Outline</LiquidMetalButton>
      <LiquidMetalButton variant="secondary">Secondary</LiquidMetalButton>
      <LiquidMetalButton variant="ghost">Ghost</LiquidMetalButton>
      <LiquidMetalButton variant="destructive">Delete</LiquidMetalButton>
      <LiquidMetalButton size="icon" aria-label="Arrow">
        <ArrowRight />
      </LiquidMetalButton>
    </div>
  ),
}
