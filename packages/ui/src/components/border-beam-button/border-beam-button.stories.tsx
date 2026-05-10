import type { Meta, StoryObj } from "@storybook/react"
import { Sparkles, Zap } from "lucide-react"
import { BorderBeamButton, BorderBeamIconButton } from "./border-beam-button"

const meta: Meta<typeof BorderBeamButton> = {
  title: "Components/BorderBeamButton",
  component: BorderBeamButton,
}
export default meta

type Story = StoryObj<typeof BorderBeamButton>

export const Default: Story = {
  args: { children: "Border Beam" },
}

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
}

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
}

export const IconButton: Story = {
  render: () => (
    <BorderBeamIconButton aria-label="Sparkles">
      <Sparkles />
    </BorderBeamIconButton>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <BorderBeamButton>Default</BorderBeamButton>
      <BorderBeamButton variant="outline">Outline</BorderBeamButton>
      <BorderBeamButton variant="secondary">Secondary</BorderBeamButton>
      <BorderBeamButton variant="destructive">Delete</BorderBeamButton>
      <BorderBeamIconButton aria-label="Zap">
        <Zap />
      </BorderBeamIconButton>
    </div>
  ),
}
