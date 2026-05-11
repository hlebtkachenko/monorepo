import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTitle,
} from "./timeline"

function Composed({ activeIndex }: { activeIndex?: number }) {
  return (
    <Timeline {...(activeIndex !== undefined ? { activeIndex } : {})}>
      <TimelineItem>
        <TimelineDot />
        <TimelineConnector />
        <TimelineContent>
          <TimelineHeader>
            <TimelineTitle>Step one</TimelineTitle>
            <TimelineDescription>First step</TimelineDescription>
          </TimelineHeader>
        </TimelineContent>
      </TimelineItem>
      <TimelineItem>
        <TimelineDot />
        <TimelineConnector />
        <TimelineContent>
          <TimelineHeader>
            <TimelineTitle>Step two</TimelineTitle>
          </TimelineHeader>
        </TimelineContent>
      </TimelineItem>
      <TimelineItem>
        <TimelineDot />
        <TimelineConnector />
        <TimelineContent>
          <TimelineHeader>
            <TimelineTitle>Step three</TimelineTitle>
          </TimelineHeader>
        </TimelineContent>
      </TimelineItem>
    </Timeline>
  )
}

describe("Timeline", () => {
  it("renders list with items", () => {
    render(<Composed />)
    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("marks active item with aria-current=step", () => {
    render(<Composed activeIndex={1} />)
    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveAttribute("data-status", "completed")
    expect(items[1]).toHaveAttribute("data-status", "active")
    expect(items[1]).toHaveAttribute("aria-current", "step")
    expect(items[2]).toHaveAttribute("data-status", "pending")
  })

  it("hides last connector by default", () => {
    render(<Composed />)
    const connectors = document.querySelectorAll(
      '[data-slot="timeline-connector"]',
    )
    // Only first 2 items get connectors (last item has no next sibling)
    expect(connectors.length).toBe(2)
  })
})
