import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "./message"

describe("Message", () => {
  it("renders aligned message regions", () => {
    render(
      <Message align="end" data-testid="message">
        <MessageContent>
          <MessageHeader>Hleb</MessageHeader>
          <div>Ready</div>
          <MessageFooter>Now</MessageFooter>
        </MessageContent>
      </Message>,
    )

    expect(screen.getByTestId("message")).toHaveAttribute("data-align", "end")
    expect(screen.getByText("Hleb")).toHaveAttribute(
      "data-slot",
      "message-header",
    )
    expect(screen.getByText("Now")).toHaveAttribute(
      "data-slot",
      "message-footer",
    )
  })
})
