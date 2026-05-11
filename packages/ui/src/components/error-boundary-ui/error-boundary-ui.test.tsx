import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ErrorBoundaryUi } from "./error-boundary-ui"

function makeError(message = "Boom", name = "TypeError") {
  const err = new Error(message)
  err.name = name
  err.stack = `${name}: ${message}\n    at handler (/src/foo.ts:42:11)\n    at /src/anon.ts:7:3`
  return err
}

describe("ErrorBoundaryUi", () => {
  it("shows error name and message in dev mode", () => {
    render(<ErrorBoundaryUi error={makeError("Bad thing")} isDev />)
    expect(screen.getByText("TypeError")).toBeInTheDocument()
    expect(screen.getByText("Bad thing")).toBeInTheDocument()
  })

  it("masks error details in non-dev mode", () => {
    render(<ErrorBoundaryUi error={makeError()} isDev={false} />)
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.queryByText("Boom")).not.toBeInTheDocument()
  })

  it("renders reset button when handler provided", async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<ErrorBoundaryUi error={makeError()} resetError={onReset} />)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onReset).toHaveBeenCalled()
  })

  it("toggles stack trace visibility", async () => {
    const user = userEvent.setup()
    render(<ErrorBoundaryUi error={makeError()} isDev />)
    await user.click(screen.getByRole("button", { name: "Toggle stack trace" }))
    expect(
      screen.getByRole("button", { name: "Toggle stack trace" }),
    ).toHaveAttribute("aria-expanded", "false")
  })

  it("shows component stack section when provided", () => {
    render(
      <ErrorBoundaryUi
        error={makeError()}
        componentStack={"    in Component\n    in Provider"}
        isDev
      />,
    )
    expect(
      screen.getByRole("button", { name: "Toggle component stack" }),
    ).toBeInTheDocument()
  })
})
