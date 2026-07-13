import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { AssistantPanel } from "./assistant-panel"

describe("AssistantPanel", () => {
  it("renders the scaffold slot with the default 'Assistant' copy", () => {
    const { container } = render(<AssistantPanel />)
    expect(
      container.querySelector('[data-slot="assistant-panel"]'),
    ).not.toBeNull()
    expect(screen.getByText("Assistant — coming soon")).toBeInTheDocument()
  })

  it("reflects a custom label", () => {
    render(<AssistantPanel label="Sidekick" />)
    expect(screen.getByText("Sidekick — coming soon")).toBeInTheDocument()
    expect(screen.queryByText("Assistant — coming soon")).toBeNull()
  })

  it("renders custom children instead of the placeholder", () => {
    render(
      <AssistantPanel label="Sidekick">
        <span>Real body</span>
      </AssistantPanel>,
    )
    expect(screen.getByText("Real body")).toBeInTheDocument()
    expect(screen.queryByText("Sidekick — coming soon")).toBeNull()
  })
})
