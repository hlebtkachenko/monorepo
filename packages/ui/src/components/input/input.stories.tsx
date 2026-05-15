import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { Input } from "./input"

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
}
export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  render: () => <Input placeholder="Type something..." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText("Type something...")
    await userEvent.type(input, "Hello world")
    await expect(input).toHaveValue("Hello world")
  },
}

export const Disabled: Story = {
  render: () => <Input placeholder="Disabled" disabled />,
}

export const WithType: Story = {
  render: () => <Input type="email" placeholder="you@example.com" />,
}

export const ExtraLarge: Story = {
  render: () => <Input inputSize="xl" placeholder="Larger field" />,
}
