import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

describe("ShellSkeleton", () => {
  it("renders the skeleton root", () => {
    const { container } = render(<ShellSkeleton />)
    expect(
      container.querySelector("[data-slot='app-shell-skeleton']"),
    ).toBeTruthy()
  })
})

describe("ErrorShell", () => {
  it("renders 404 variant with default copy", () => {
    render(<ErrorShell variant="404" homeHref="/" />)
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute(
      "href",
      "/",
    )
  })

  it("renders reset button only when onReset is provided", () => {
    const { rerender } = render(<ErrorShell homeHref="/" />)
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument()

    rerender(<ErrorShell homeHref="/" onReset={() => undefined} />)
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument()
  })

  it("renders forbidden variant", () => {
    const { container } = render(<ErrorShell variant="forbidden" />)
    expect(container.querySelector("[data-variant='forbidden']")).toBeTruthy()
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument()
  })
})
