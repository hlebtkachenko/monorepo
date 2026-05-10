import type { Meta, StoryObj } from "@storybook/react"
import { expect, within } from "storybook/test"
import { Slider } from "./slider"

const meta: Meta<typeof Slider> = {
  title: "Components/Slider",
  component: Slider,
}
export default meta
type Story = StoryObj<typeof Slider>

export const Default: Story = {
  render: () => <Slider defaultValue={[50]} className="w-64" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slider = canvas.getByRole("slider")
    await expect(slider).toHaveAttribute("aria-valuenow", "50")
  },
}

export const Range: Story = {
  render: () => <Slider defaultValue={[25, 75]} className="w-64" />,
}

export const Disabled: Story = {
  render: () => <Slider defaultValue={[40]} disabled className="w-64" />,
}
