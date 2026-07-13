import type { Meta, StoryObj } from "@storybook/react"

import { Bubble, BubbleContent, BubbleReactions } from "./bubble"

const meta: Meta<typeof Bubble> = {
  title: "Components/Bubble",
  component: Bubble,
}
export default meta
type Story = StoryObj<typeof Bubble>

export const Default: Story = {
  render: () => (
    <Bubble>
      <BubbleContent>Default message</BubbleContent>
    </Bubble>
  ),
}
export const Secondary: Story = {
  render: () => (
    <Bubble variant="secondary">
      <BubbleContent>Secondary</BubbleContent>
    </Bubble>
  ),
}
export const Muted: Story = {
  render: () => (
    <Bubble variant="muted">
      <BubbleContent>Muted</BubbleContent>
    </Bubble>
  ),
}
export const Tinted: Story = {
  render: () => (
    <Bubble variant="tinted">
      <BubbleContent>Tinted</BubbleContent>
    </Bubble>
  ),
}
export const Outline: Story = {
  render: () => (
    <Bubble variant="outline">
      <BubbleContent>Outline</BubbleContent>
    </Bubble>
  ),
}
export const Ghost: Story = {
  render: () => (
    <Bubble variant="ghost">
      <BubbleContent>Ghost</BubbleContent>
    </Bubble>
  ),
}
export const Destructive: Story = {
  render: () => (
    <Bubble variant="destructive">
      <BubbleContent>Failed</BubbleContent>
    </Bubble>
  ),
}
export const EndAligned: Story = {
  render: () => (
    <Bubble align="end">
      <BubbleContent>End aligned</BubbleContent>
    </Bubble>
  ),
}
export const SideTop: Story = {
  render: () => (
    <Bubble>
      <BubbleContent>Top reactions</BubbleContent>
      <BubbleReactions side="top">👍</BubbleReactions>
    </Bubble>
  ),
}
export const SideBottom: Story = {
  render: () => (
    <Bubble>
      <BubbleContent>Bottom reactions</BubbleContent>
      <BubbleReactions side="bottom">👍</BubbleReactions>
    </Bubble>
  ),
}
export const AlignStart: Story = {
  render: () => (
    <Bubble>
      <BubbleContent>Start reactions</BubbleContent>
      <BubbleReactions align="start">👍</BubbleReactions>
    </Bubble>
  ),
}
