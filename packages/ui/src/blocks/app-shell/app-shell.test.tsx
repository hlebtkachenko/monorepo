import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, it, expect, vi } from "vitest"

import { NextIntlClientProvider } from "@workspace/i18n/client"
import messages from "@workspace/i18n/messages/en.json"
import { IconProvider } from "@workspace/ui/icon-packs"

import { AppShell } from "./app-shell"
import { AppShellBottomNav } from "./app-shell-bottom-nav"
import { AppInspectorRail } from "./app-inspector-rail"
import { ShellSkeleton } from "./skeletons/shell-skeleton"
import { ErrorShell } from "./skeletons/error-shell"

// AppShell now renders IconButtons (useIcons), so every render needs the
// IconProvider the app mounts at its root.
const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
    { wrapper: IconProvider },
  )

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
    // AppBody owns the panel row and wraps the content card.
    expect(container.querySelector("[data-slot='app-shell-body']")).toBeTruthy()
    expect(
      container.querySelector(
        "[data-slot='app-shell-body'] [data-slot='app-shell-content']",
      ),
    ).toBeTruthy()
    expect(screen.getByTestId("body")).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='app-shell-assistant']"),
    ).toBeNull()
  })

  it("exposes a skip-to-content link and a named main landmark", () => {
    const { container } = render(
      <AppShell rail={<div />} sidebar={<div />}>
        <div data-testid="body" />
      </AppShell>,
    )
    const skip = screen.getByRole("link", { name: /skip to content/i })
    expect(skip).toHaveAttribute("href", "#main-content")
    // The skip link must be the very first focusable element so a keyboard
    // user reaches it on their first Tab.
    expect(container.querySelector("[data-slot='app-shell-skip-link']")).toBe(
      skip,
    )

    const main = container.querySelector("[data-slot='app-shell-main']")
    expect(main).toHaveAttribute("id", "main-content")
    expect(main).toHaveAttribute("aria-label", "Main content")
    expect(main).toHaveAttribute("tabindex", "-1")
    // The skip link target resolves to the main landmark.
    expect(screen.getByRole("main")).toBe(main)
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
    fireEvent.click(screen.getByRole("button", { name: /collapse assistant/i }))
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

  it("renders the empty Inspector rail and closes by button or Escape", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Invoices", "Issued"]}
          recordKey="fp-2026-0001"
          name="#FP-2026-0001"
        />
      </AppShell>,
    )

    expect(await screen.findByText("#FP-2026-0001")).toBeInTheDocument()

    const close = screen.getByRole("button", { name: "Close inspector" })
    expect(close).toHaveAttribute("data-size", "sm")
    fireEvent.click(close)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    onOpenChange.mockClear()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("closes the Inspector rail on Escape detected via code fallback (no key field)", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    fireEvent.keyDown(window, { code: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("collapses the Inspector rail on a genuine handle click (no movement)", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    const handle = screen.getByRole("separator")
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 100 })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("resizes the Inspector width when dragged, does not collapse on a returning drag, and ignores non-primary pointers", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    const aside = (await screen.findByText("Invoice")).closest(
      '[data-slot="app-shell-inspector"]',
    ) as HTMLElement
    const handle = screen.getByRole("separator")
    const widthOf = () => Number.parseFloat(aside.style.width)
    const initialWidth = widthOf()

    // A drag past the threshold resizes (handle is on the left edge, so
    // dragging left grows the rail) and must not collapse it.
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 100 })
    expect(widthOf()).toBeGreaterThan(initialWidth)
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 100 })
    expect(onOpenChange).not.toHaveBeenCalled()

    onOpenChange.mockClear()

    // A drag that crosses the threshold and then returns near its origin is
    // still a drag, not a click — must not collapse.
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 100 })
    fireEvent.pointerMove(handle, { clientX: 99, clientY: 100 })
    fireEvent.pointerUp(handle, { clientX: 99, clientY: 100 })
    expect(onOpenChange).not.toHaveBeenCalled()

    onOpenChange.mockClear()

    // A right-click on the handle must never collapse the rail.
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 2 })
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 100, button: 2 })
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("shows a two-line drag/collapse tooltip on hover, anchored at pointer entry", async () => {
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={vi.fn()}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    const handle = screen.getByRole("separator")
    fireEvent.pointerEnter(handle, { clientY: 40 })

    await screen.findAllByText("Drag to resize")
    expect(screen.getAllByText("Drag to resize").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Click to collapse").length).toBeGreaterThan(0)

    fireEvent.pointerLeave(handle)
    expect(screen.queryByText("Drag to resize")).not.toBeInTheDocument()
  })

  it("hides the tooltip while actively dragging the handle", async () => {
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={vi.fn()}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    const handle = screen.getByRole("separator")
    fireEvent.pointerEnter(handle, { clientY: 40 })
    await screen.findAllByText("Drag to resize")

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    expect(screen.queryByText("Drag to resize")).not.toBeInTheDocument()

    fireEvent.pointerUp(handle, { clientX: 100, clientY: 100 })
  })

  it("does not resurrect the tooltip on reopen after a hover-then-collapse-click, since no pointerleave fires when the handle unmounts", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")

    const handle = screen.getByRole("separator")
    fireEvent.pointerEnter(handle, { clientY: 40 })
    await screen.findAllByText("Drag to resize")

    // A genuine click (no movement) collapses without an intervening
    // pointerleave — the handle unmounts mid-hover.
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 100 })
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppShell>
          <AppInspectorRail
            open={false}
            onOpenChange={onOpenChange}
            breadcrumb={["Records", "Details"]}
            recordKey="inv-1"
            name="Invoice"
          />
        </AppShell>
      </NextIntlClientProvider>,
    )
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppShell>
          <AppInspectorRail
            open
            onOpenChange={onOpenChange}
            breadcrumb={["Records", "Details"]}
            recordKey="inv-1"
            name="Invoice"
          />
        </AppShell>
      </NextIntlClientProvider>,
    )
    await screen.findByText("Invoice")

    expect(screen.queryByText("Drag to resize")).not.toBeInTheDocument()
  })

  it("lets an open dropdown consume Escape before the Inspector rail", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <button
          type="button"
          data-state="open"
          aria-expanded="true"
          aria-haspopup="menu"
        >
          Kind
        </button>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("closes the Inspector rail on Escape when an unrelated persistent disclosure (e.g. sidebar Collapsible) is open", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <button type="button" data-state="open" aria-expanded="true">
          Section
        </button>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does not consume or prevent-default the Escape event when closing the Inspector rail", async () => {
    const onOpenChange = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={onOpenChange}
          breadcrumb={["Records", "Details"]}
          recordKey="inv-1"
          name="Invoice"
        />
      </AppShell>,
    )
    await screen.findByText("Invoice")
    const windowListener = vi.fn()
    window.addEventListener("keydown", windowListener)
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(event.defaultPrevented).toBe(false)
    expect(windowListener).toHaveBeenCalledTimes(1)
    window.removeEventListener("keydown", windowListener)
  })

  it("renders the full InspectorSheet (breadcrumb, name, actions, tab rail) and fires its callbacks", async () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const onCopy = vi.fn()
    const onSwitchLayout = vi.fn()
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={vi.fn()}
          breadcrumb={["Invoices", "Issued"]}
          recordKey="inv-1"
          name="Invoice #1"
          onPrevious={onPrevious}
          onNext={onNext}
          onCopy={onCopy}
          onSwitchLayout={onSwitchLayout}
        />
      </AppShell>,
    )
    await screen.findByText("Invoice #1")
    expect(screen.getByText("Invoices")).toBeInTheDocument()
    expect(screen.getByText("Issued")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Previous item" }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Next item" }))
    expect(onNext).toHaveBeenCalledTimes(1)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Copy" }))
    await user.click(await screen.findByRole("menuitem", { name: "Copy link" }))
    expect(onCopy).toHaveBeenCalledWith("link")
    fireEvent.click(screen.getByRole("button", { name: "Switch layout" }))
    expect(onSwitchLayout).toHaveBeenCalledTimes(1)

    // The 48px tab rail switches the active tab (no content wired here, but
    // the tab button itself becomes the active one).
    const activityTab = screen.getByRole("button", { name: "Activity" })
    fireEvent.click(activityTab)
    expect(activityTab).toHaveAttribute("data-active", "true")
  })

  it("disables previous/next when omitted (first/last item)", async () => {
    render(
      <AppShell>
        <AppInspectorRail
          open
          onOpenChange={vi.fn()}
          breadcrumb={["Invoices", "Issued"]}
          recordKey="inv-1"
          name="Invoice #1"
          onNext={vi.fn()}
        />
      </AppShell>,
    )
    await screen.findByText("Invoice #1")
    expect(screen.getByRole("button", { name: "Previous item" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next item" })).not.toBeDisabled()
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

  it("is content-shaped — rail, header bar, sidebar, and content regions", () => {
    const { container } = render(<ShellSkeleton />)
    // Four shell-shaped placeholder regions (rail + header + sidebar +
    // content) instead of the old single full-viewport slab.
    expect(
      container.querySelectorAll(
        "[data-slot='app-shell-skeleton'] [data-slot='skeleton']",
      ),
    ).toHaveLength(4)
  })
})

describe("ErrorShell", () => {
  it("renders 404 variant with default copy", () => {
    render(<ErrorShell variant="404" homeHref="/" />)
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /go back/i })).toHaveAttribute(
      "href",
      "/",
    )
  })

  it("renders the catalog retry action", () => {
    render(<ErrorShell homeHref="/" onReset={() => undefined} />)
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument()
  })

  it("renders forbidden variant", () => {
    const { container } = render(<ErrorShell variant="forbidden" />)
    expect(container.querySelector("[data-state='access_denied']")).toBeTruthy()
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument()
  })
})
