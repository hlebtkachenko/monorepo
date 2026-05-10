import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

const meta: Meta<typeof Tooltip> = {
  title: "Components/Tooltip",
  component: Tooltip,
}
export default meta
type Story = StoryObj<typeof Tooltip>

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <button>Hover me</button>
        </TooltipTrigger>
        <TooltipContent>Tooltip content</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  play: async () => {
    const elements = within(document.body).getAllByText("Tooltip content")
    await expect(elements.length).toBeGreaterThan(0)
  },
}

export const OnButton: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button>Save</button>
        </TooltipTrigger>
        <TooltipContent>Save your changes</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole("button", { name: /save/i }))
    const elements = await within(document.body).findAllByText(
      "Save your changes",
    )
    await expect(elements.length).toBeGreaterThan(0)
  },
}
