import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  Tour,
  TourActions,
  TourClose,
  TourDescription,
  TourHeader,
  TourNext,
  TourPortal,
  TourPrev,
  TourSpotlight,
  TourStep,
  TourTitle,
  TourTooltip,
} from "./tour"

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <div>
      <div id="t1">Target 1</div>
      <div id="t2">Target 2</div>
      <Tour defaultOpen onOpenChange={onOpenChange}>
        <TourPortal>
          <TourSpotlight />
          <TourStep target="#t1">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Step one</TourTitle>
                <TourDescription>First step description</TourDescription>
              </TourHeader>
              <TourActions>
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>
          <TourStep target="#t2">
            <TourClose />
            <TourTooltip>
              <TourHeader>
                <TourTitle>Step two</TourTitle>
                <TourDescription>Second step description</TourDescription>
              </TourHeader>
              <TourActions>
                <TourPrev />
                <TourNext />
              </TourActions>
            </TourTooltip>
          </TourStep>
        </TourPortal>
      </Tour>
    </div>
  )
}

describe("Tour", () => {
  it("renders the first step content when open", () => {
    render(<Harness />)
    expect(screen.getByText("Step one")).toBeInTheDocument()
    expect(screen.getByText("First step description")).toBeInTheDocument()
  })

  it("advances to the next step when next is clicked", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Next step" }))
    expect(screen.getByText("Step two")).toBeInTheDocument()
  })

  it("fires onOpenChange(false) when close is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole("button", { name: "Close tour" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
