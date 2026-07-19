import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import {
  useOptimisticFavorite,
  type ContentHeaderFavoriteToggle,
} from "./content-header-favorite"

/**
 * Renders the controlled favorite the hook returns as a bare `aria-pressed`
 * button, so a test can drive the optimistic state machine without the portal
 * plumbing an archetype would drag in.
 */
function Harness({ toggle }: { toggle?: ContentHeaderFavoriteToggle }) {
  const favorite = useOptimisticFavorite(toggle)
  if (!favorite) return <div data-testid="no-star" />
  return (
    <button
      type="button"
      aria-pressed={favorite.active}
      onClick={favorite.onToggle}
    >
      star
    </button>
  )
}

describe("useOptimisticFavorite", () => {
  it("returns undefined (no star) when no toggle is supplied", () => {
    render(<Harness />)
    expect(screen.getByTestId("no-star")).toBeInTheDocument()
  })

  it("seeds the pressed state from initialActive", () => {
    render(<Harness toggle={{ initialActive: true, onToggle: vi.fn() }} />)
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true")
  })

  it("commits the server-confirmed state on toggle", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn().mockResolvedValue(true)
    render(<Harness toggle={{ initialActive: false, onToggle }} />)

    await user.click(screen.getByRole("button"))

    expect(onToggle).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    )
  })

  it("reverts to the confirmed state when the write rejects", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn().mockRejectedValue(new Error("boom"))
    render(<Harness toggle={{ initialActive: true, onToggle }} />)

    await user.click(screen.getByRole("button"))

    expect(onToggle).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    )
  })
})
