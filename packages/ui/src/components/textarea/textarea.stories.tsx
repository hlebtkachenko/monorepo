import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { Textarea } from "./textarea"

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
}
export default meta
type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  render: () => <Textarea placeholder="Enter a message..." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByPlaceholderText("Enter a message...")
    await userEvent.type(textarea, "Hello from Storybook")
    await expect(textarea).toHaveValue("Hello from Storybook")
  },
}

export const WithValue: Story = {
  render: () => <Textarea defaultValue="Some pre-filled content here." />,
}

export const Disabled: Story = {
  render: () => <Textarea disabled placeholder="Disabled textarea" />,
}
