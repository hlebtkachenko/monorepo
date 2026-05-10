import type { Meta, StoryObj } from "@storybook/react"
import { Sparkles } from "lucide-react"
import { LiquidMetalButton } from "./liquid-metal-button"

const meta: Meta<typeof LiquidMetalButton> = {
  title: "Components/Button/LiquidMetal",
  component: LiquidMetalButton,
}
export default meta

type Story = StoryObj<typeof LiquidMetalButton>

export const Default: Story = {
  args: { label: "Get Started" },
}

export const CustomLabel: Story = {
  args: { label: "Subscribe" },
}

export const IconMode: Story = {
  args: {
    viewMode: "icon",
    icon: <Sparkles className="size-4" />,
    label: "Sparkle",
  },
}

export const Disabled: Story = {
  args: { label: "Disabled", disabled: true },
}
