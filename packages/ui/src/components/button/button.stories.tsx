import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "./button"

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
}
export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: { children: "Button" },
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
  args: { children: "Link button", variant: "link" },
}

export const Small: Story = {
  args: { children: "Small", size: "sm" },
}

export const Large: Story = {
  args: { children: "Large", size: "lg" },
}

export const ExtraLarge: Story = {
  args: { children: "Extra large", size: "xl" },
}

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}

export const SizeXs: Story = {
  args: { children: "Xs", size: "xs" },
}

export const SizeIcon: Story = {
  args: { children: "Icon", size: "icon" },
}

export const SizeIconXs: Story = {
  args: { children: "Icon Xs", size: "icon-xs" },
}

export const SizeIconSm: Story = {
  args: { children: "Icon Sm", size: "icon-sm" },
}

export const SizeIconLg: Story = {
  args: { children: "Icon Lg", size: "icon-lg" },
}

export const SizeIconXl: Story = {
  args: { children: "Icon Xl", size: "icon-xl" },
}
