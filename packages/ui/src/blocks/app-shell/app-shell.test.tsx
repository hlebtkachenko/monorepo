import { fireEvent, render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { AppShell } from "./app-shell"
import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

describe("AppShell", () => {
  it("renders rail, sidebar, body, and (closed) assistant by default", () => {
    const { container } = render(
      <AppShell
        rail={<div data-testid="rail" />}
        sidebar={<div data-testid="sidebar" />}
        assistant={<div data-testid="assistant" />}
      >
        <div data-testid="body" />
      </AppShell>,
    )
    expect(container.querySelector("[data-slot='app-shell']")).toBeTruthy()
    expect(container.querySelector("[data-slot='app-shell-rail']")).toBeTruthy()
    expect(
      container.querySelector("[data-slot='app-shell-sidebar']"),
    ).toBeTruthy()
    expect(container.querySelector("[data-slot='app-shell-main']")).toBeTruthy()
    expect(screen.getByTestId("body")).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeNull()
  })

  it("toggles the assistant panel on button click", () => {
    const { container } = render(
      <AppShell sidebar={<div />} assistant={<div data-testid="assistant" />}>
        <div />
      </AppShell>,
    )
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /open assistant/i }))
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /close assistant/i }))
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeNull()
  })

  it("collapses and reopens the sidebar via the toggle", () => {
    render(
      <AppShell sidebar={<div data-testid="sidebar" />}>
        <div />
      </AppShell>,
    )
    expect(
      screen.getByRole("button", { name: /collapse sidebar/i }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }))
    expect(
      screen.getByRole("button", { name: /open sidebar/i }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /open sidebar/i }))
    expect(
      screen.getByRole("button", { name: /collapse sidebar/i }),
    ).toBeInTheDocument()
  })
})

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
