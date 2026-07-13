import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Bubble, BubbleContent } from "./bubble"

describe("Bubble", () => {
  it("applies variant and alignment", () => {
    render(
      <Bubble variant="tinted" align="end" data-testid="bubble">
        <BubbleContent>Booked</BubbleContent>
      </Bubble>,
    )
    expect(screen.getByTestId("bubble")).toHaveAttribute(
      "data-variant",
      "tinted",
    )
    expect(screen.getByTestId("bubble")).toHaveAttribute("data-align", "end")
  })
})
