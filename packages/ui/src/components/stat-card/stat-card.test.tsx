import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  StatCard,
  StatCardDelta,
  StatCardLabel,
  StatCardValue,
} from "./stat-card"

describe("StatCard", () => {
  it("renders metric content and trend", () => {
    render(
      <StatCard>
        <StatCardLabel>Revenue</StatCardLabel>
        <StatCardValue>42</StatCardValue>
        <StatCardDelta trend="up">8%</StatCardDelta>
      </StatCard>,
    )
    expect(screen.getByText("Revenue")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("8%")).toHaveAttribute("data-trend", "up")
  })
})
