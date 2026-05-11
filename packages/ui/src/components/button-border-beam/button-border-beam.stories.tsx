import type { Meta, StoryObj } from "@storybook/react"
import { Sparkles, Zap } from "lucide-react"
import { BorderBeamButton, BorderBeamIconButton } from "./button-border-beam"

const meta: Meta<typeof BorderBeamButton> = {
  title: "Components/ButtonBorderBeam",
  component: BorderBeamButton,
}
export default meta

type Story = StoryObj<typeof BorderBeamButton>

export const Default: Story = {
  args: { children: "Border Beam" },
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

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
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
      <BorderBeamButton variant="ghost">Ghost</BorderBeamButton>
      <BorderBeamButton variant="destructive">Delete</BorderBeamButton>
      <BorderBeamButton variant="link">Link</BorderBeamButton>
      <BorderBeamIconButton aria-label="Zap">
        <Zap />
      </BorderBeamIconButton>
    </div>
  ),
}
