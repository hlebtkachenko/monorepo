import type { Meta, StoryObj } from "@storybook/react"
import { expect, within } from "storybook/test"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card"

const meta: Meta<typeof HoverCard> = {
  title: "Components/HoverCard",
  component: HoverCard,
}
export default meta
type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  render: () => (
    <HoverCard defaultOpen>
      <HoverCardTrigger>
        <span className="cursor-pointer underline">Hover me</span>
      </HoverCardTrigger>
      <HoverCardContent>
        <p className="text-sm">This is the hover card content.</p>
      </HoverCardContent>
    </HoverCard>
  ),
  play: async () => {
    const body = within(document.body)
    await expect(
      body.getByText("This is the hover card content."),
    ).toBeInTheDocument()
  },
}
