import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Marker, MarkerContent } from "./marker"

describe("Marker", () => {
  it("renders separator state", () => {
    render(
      <Marker variant="separator">
        <MarkerContent>Today</MarkerContent>
      </Marker>,
    )
    expect(screen.getByText("Today").parentElement).toHaveAttribute(
      "data-variant",
      "separator",
    )
  })
})
