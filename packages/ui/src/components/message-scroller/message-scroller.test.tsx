import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./message-scroller"

describe("MessageScroller", () => {
  it("renders conversation items", () => {
    render(
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <MessageScrollerItem>Message one</MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>,
    )
    expect(screen.getByText("Message one")).toHaveAttribute(
      "data-slot",
      "message-scroller-item",
    )
  })
})
