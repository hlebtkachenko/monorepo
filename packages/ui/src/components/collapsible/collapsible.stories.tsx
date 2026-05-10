import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible"

const meta: Meta<typeof Collapsible> = {
  title: "Components/Collapsible",
  component: Collapsible,
}
export default meta
type Story = StoryObj<typeof Collapsible>

export const Default: Story = {
  render: () => (
    <Collapsible className="w-64 space-y-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
        Toggle section
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-md border px-3 py-2 text-sm">
        This content is collapsible. It will show or hide when the trigger is
        clicked.
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: /toggle section/i }),
    )
    await expect(canvas.getByText(/collapsible/i)).toBeVisible()
  },
}

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-64 space-y-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
        Open by default
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-md border px-3 py-2 text-sm">
        This section starts open.
      </CollapsibleContent>
    </Collapsible>
  ),
}
