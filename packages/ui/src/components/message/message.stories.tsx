import type { Meta, StoryObj } from "@storybook/react"

import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "./message"

const meta: Meta<typeof Message> = {
  title: "Components/Message",
  component: Message,
}
export default meta

type Story = StoryObj<typeof Message>

export const Default: Story = {
  render: () => (
    <Message>
      <MessageContent>
        <MessageHeader>Afframe</MessageHeader>
        <Bubble variant="muted">
          <BubbleContent>Review completed.</BubbleContent>
        </Bubble>
        <MessageFooter>Just now</MessageFooter>
      </MessageContent>
    </Message>
  ),
}

export const EndAligned: Story = {
  render: () => (
    <Message align="end">
      <MessageContent>
        <Bubble align="end">
          <BubbleContent>Approve the booking.</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  ),
}
