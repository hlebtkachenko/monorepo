import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { BorderBeam } from "./border-beam"

describe("BorderBeam", () => {
  it("renders children", () => {
    render(
      <BorderBeam>
        <span>Wrapped content</span>
      </BorderBeam>,
    )
    expect(screen.getByText("Wrapped content")).toBeInTheDocument()
  })

  it("renders children when inactive", () => {
    render(
      <BorderBeam active={false}>
        <span>Inactive content</span>
      </BorderBeam>,
    )
    expect(screen.getByText("Inactive content")).toBeInTheDocument()
  })

  it("preserves child markup", () => {
    render(
      <BorderBeam borderRadius={8}>
        <button type="button">Action</button>
      </BorderBeam>,
    )
    expect(
      screen.getByRole("button", { name: "Action" }),
    ).toBeInTheDocument()
  })
})
