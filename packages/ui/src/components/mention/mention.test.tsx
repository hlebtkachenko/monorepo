import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Mention, MentionContent, MentionInput, MentionItem } from "./mention"

describe("Mention", () => {
  it("renders root with data-slot", () => {
    const { container } = render(
      <Mention>
        <MentionInput placeholder="Type..." />
        <MentionContent>
          <MentionItem value="alice">Alice</MentionItem>
        </MentionContent>
      </Mention>,
    )
    expect(container.querySelector("[data-slot=mention]")).toBeInTheDocument()
  })

  it("renders input with placeholder", () => {
    render(
      <Mention>
        <MentionInput placeholder="Type @ to mention..." />
        <MentionContent>
          <MentionItem value="alice">Alice</MentionItem>
        </MentionContent>
      </Mention>,
    )
    expect(
      screen.getByPlaceholderText("Type @ to mention..."),
    ).toBeInTheDocument()
  })

  it("input carries data-slot", () => {
    render(
      <Mention>
        <MentionInput placeholder="x" />
        <MentionContent>
          <MentionItem value="a">A</MentionItem>
        </MentionContent>
      </Mention>,
    )
    expect(
      document.querySelector("[data-slot=mention-input]"),
    ).toBeInTheDocument()
  })
})
