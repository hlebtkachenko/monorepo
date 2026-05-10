import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { Switch } from "./switch"

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
}
export default meta
type Story = StoryObj<typeof Switch>

export const Default: Story = {
  render: () => <Switch aria-label="Toggle" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("switch")
    await expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
  },
}

export const Checked: Story = {
  render: () => <Switch defaultChecked />,
}

export const Small: Story = {
  render: () => <Switch size="sm" />,
}

export const Disabled: Story = {
  render: () => <Switch disabled />,
}
