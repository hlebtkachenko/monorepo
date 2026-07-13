import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { Toggle } from "./toggle"

const meta: Meta<typeof Toggle> = {
  title: "Components/Toggle",
  component: Toggle,
}
export default meta
type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  render: () => <Toggle>Bold</Toggle>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: /bold/i })
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
  },
}

export const Outline: Story = {
  render: () => <Toggle variant="outline">Italic</Toggle>,
}

export const Small: Story = {
  render: () => <Toggle size="sm">Sm</Toggle>,
}

export const Pressed: Story = {
  render: () => <Toggle defaultPressed>Pressed</Toggle>,
}

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
}
