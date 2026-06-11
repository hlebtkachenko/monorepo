import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { AppShell } from "./app-shell"
import { AppShellBottomNav } from "./app-shell-bottom-nav"
import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

const ORIGINAL_INNER_WIDTH = window.innerWidth

/**
 * `useIsMobile` reads `window.innerWidth` in an effect (the setup-file
 * matchMedia mock never fires), so setting the width before render is
 * enough to land in the mobile branch.
 */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  })
}

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

describe("AppShell (mobile, <md)", () => {
  afterEach(() => {
    setViewportWidth(ORIGINAL_INNER_WIDTH)
  })

  it("hides the rail and inline panels via CSS breakpoint classes", () => {
    const { container } = render(
      <AppShell
        rail={<div data-testid="rail" />}
        sidebar={<div data-testid="sidebar" />}
        assistant={<div data-testid="assistant" />}
        defaultAssistantOpen
      >
        <div />
      </AppShell>,
    )
    expect(container.querySelector("[data-slot='app-shell-rail']")).toHaveClass(
      "max-md:hidden",
    )
    expect(
      container.querySelector("[data-slot='app-shell-sidebar']"),
    ).toHaveClass("max-md:hidden")
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toHaveClass("max-md:hidden")
  })

  it("opens the sidebar as a left sheet drawer on mobile", () => {
    setViewportWidth(375)
    const { container } = render(
      <AppShell sidebar={<div data-testid="sidebar-content" />}>
        <div />
      </AppShell>,
    )
    expect(
      document.querySelector("[data-slot='app-shell-mobile-sidebar']"),
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /open sidebar/i }))
    const drawer = document.querySelector(
      "[data-slot='app-shell-mobile-sidebar']",
    )
    expect(drawer).toBeTruthy()
    expect(
      drawer?.querySelector("[data-testid='sidebar-content']"),
    ).toBeTruthy()
    expect(
      document.querySelector("[data-slot='sheet-content']"),
    ).toHaveAttribute("data-side", "left")
    // The inline (desktop) sidebar stays untouched — CSS hides it.
    expect(
      container.querySelector("[data-slot='app-shell-sidebar']"),
    ).toBeTruthy()
  })

  it("opens the assistant as a right sheet on mobile instead of the inline panel", () => {
    setViewportWidth(375)
    const { container } = render(
      <AppShell assistant={<div data-testid="assistant-content" />}>
        <div />
      </AppShell>,
    )
    fireEvent.click(screen.getByRole("button", { name: /open assistant/i }))
    const sheet = document.querySelector(
      "[data-slot='app-shell-mobile-assistant']",
    )
    expect(sheet).toBeTruthy()
    expect(
      sheet?.querySelector("[data-testid='assistant-content']"),
    ).toBeTruthy()
    expect(
      document.querySelector("[data-slot='sheet-content']"),
    ).toHaveAttribute("data-side", "right")
    // The inline assistant panel must NOT mount on mobile.
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeNull()
    // The modal sheet aria-hides the shell, so close via the sheet's
    // own close button.
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }))
    expect(
      document.querySelector("[data-slot='app-shell-mobile-assistant']"),
    ).toBeNull()
  })

  it("renders the bottomNav slot in an md-hidden wrapper", () => {
    const { container } = render(
      <AppShell bottomNav={<div data-testid="bottom-nav" />}>
        <div />
      </AppShell>,
    )
    const wrapper = container.querySelector(
      "[data-slot='app-shell-bottom-nav']",
    )
    expect(wrapper).toBeTruthy()
    expect(wrapper).toHaveClass("md:hidden")
    expect(wrapper?.querySelector("[data-testid='bottom-nav']")).toBeTruthy()
  })
})

describe("AppShellBottomNav", () => {
  const items = [
    { label: "Company", icon: "Goal", href: "/acme" },
    { label: "Finance", icon: "PiggyBank", href: "/acme/finance" },
    { label: "Settings", icon: "Settings", href: "/acme/settings" },
  ] as const

  it("renders one link per item with the right href", () => {
    render(
      <IconProvider>
        <AppShellBottomNav items={[...items]} />
      </IconProvider>,
    )
    const company = screen.getByRole("tab", { name: /company/i })
    expect(company).toHaveAttribute("href", "/acme")
    expect(screen.getByRole("tab", { name: /finance/i })).toHaveAttribute(
      "href",
      "/acme/finance",
    )
    expect(screen.getAllByRole("tab")).toHaveLength(3)
  })

  it("marks the longest-prefix match active", () => {
    render(
      <IconProvider>
        <AppShellBottomNav
          items={[...items]}
          currentPath="/acme/finance/reports"
        />
      </IconProvider>,
    )
    expect(screen.getByRole("tab", { name: /finance/i })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByRole("tab", { name: /company/i })).toHaveAttribute(
      "aria-selected",
      "false",
    )
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
