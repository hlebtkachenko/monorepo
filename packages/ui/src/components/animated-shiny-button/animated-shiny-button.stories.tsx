import type { Meta, StoryObj } from "@storybook/react"
import { ChevronRight, Sparkles } from "lucide-react"
import { AnimatedShinyButton } from "./animated-shiny-button"

const meta: Meta<typeof AnimatedShinyButton> = {
  title: "Components/Button/AnimatedShiny",
  component: AnimatedShinyButton,
}
export default meta

type Story = StoryObj<typeof AnimatedShinyButton>

export const Default: Story = {
  args: { children: "Get Started" },
}

export const WithIcon: Story = {
  render: () => (
    <AnimatedShinyButton>
      <Sparkles className="size-4" />
      Explore
    </AnimatedShinyButton>
  ),
}

export const WithArrow: Story = {
  render: () => (
    <AnimatedShinyButton>
      Learn More
      <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
    </AnimatedShinyButton>
  ),
}

export const CustomHighlight: Story = {
  render: () => (
    <AnimatedShinyButton highlightColor="var(--destructive)">
      Custom Color
    </AnimatedShinyButton>
  ),
}

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
}
