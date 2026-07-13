import type { Meta, StoryObj } from "@storybook/react"

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./message-scroller"

const meta: Meta<typeof MessageScroller> = {
  title: "Components/MessageScroller",
  component: MessageScroller,
}
export default meta
type Story = StoryObj<typeof MessageScroller>

export const Default: Story = {
  render: () => (
    <MessageScrollerProvider>
      <MessageScroller className="h-80 rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            {Array.from({ length: 12 }, (_, index) => (
              <MessageScrollerItem key={index}>
                Message {index + 1}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  ),
}

export const StartDirection: Story = {
  render: () => (
    <MessageScrollerProvider>
      <MessageScroller className="h-80 rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            {Array.from({ length: 12 }, (_, index) => (
              <MessageScrollerItem key={index}>
                Message {index + 1}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="start" />
      </MessageScroller>
    </MessageScrollerProvider>
  ),
}
