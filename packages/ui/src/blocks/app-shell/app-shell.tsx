"use client"

import * as React from "react"

import { Logo } from "@workspace/ui/brand-assets"
import { Button } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetTitle } from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { PanelLeftIcon, PanelRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

interface AppShellProps {
  header?: React.ReactNode
  rail?: React.ReactNode
  sidebar?: React.ReactNode
  assistant?: React.ReactNode
  /**
   * Mobile bottom navigation, rendered only below the `md` breakpoint
   * (the rail is hidden there). Compose it from the app-shell block's
   * `AppShellBottomNav` (which wires the `navigation-bottom-mobile`
   * component) — or pass any node. When present, the content area
   * reserves the bar's height at the bottom on mobile.
   */
  bottomNav?: React.ReactNode
  children?: React.ReactNode
  className?: string
  defaultSidebarOpen?: boolean
  defaultAssistantOpen?: boolean
  /**
   * Card treatment for the assistant panel — a manual, code-level switch
   * (NOT a user-facing control), mirroring how the icon-pack system keeps
   * multiple variants in code.
   *   - `"shell"`    (default) → the flat shell card (matches the main card).
   *   - `"dropdown"` → dropdown/popover-inspired card (rounded-lg + hairline
   *     border + popover surface). Outer shadow is intentionally omitted: the
   *     panel's own `overflow` clips it (see ASSISTANT_DROPDOWN_CARD).
   * Flip by passing `assistantVariant="dropdown"` from the page.
   */
  assistantVariant?: "shell" | "dropdown"
  /**
   * Logo content for the rail's top square. Defaults to the Afframe
   * logomark in brand-primary tone (auto-adapts light↔dark via the
   * Logo component's sugar tone system). Other apps pass their own
   * `<Logo>` (e.g. `tone="admin"` for the admin app) or `null` to
   * omit the logo entirely.
   */
  logo?: React.ReactNode
  /**
   * Optional href the painted logo artwork links to (e.g. the org
   * dashboard). When set, a transparent `<a>` overlay covers just the
   * visible artwork area (~32×26 inside the 60×40 rail-header zone) —
   * so the gray breathing-room is NOT clickable, only the logo
   * pixels. For Next.js client-side navigation, pass a wrapped
   * `<Link>` via the `logo` prop instead.
   */
  logoHref?: string
}

const DEFAULT_LOGO = (
  <Logo
    variant="logomark"
    tone="primary"
    className="h-[var(--shell-header-height)] w-[var(--shell-rail-width)]"
  />
)

// Single source of truth for sizes (px). Both the sidebar and the assistant
// panel resize via plain flex + manual pointer drag — NOT
// react-resizable-panels, whose pixel-sized panels preserve their pixel size
// and DON'T reflow when the parent element (the window) resizes, which froze
// the shell at its initial width and made it overflow on resize.
const SIZES = {
  sidebarDefault: 236,
  sidebarMin: 160,
  sidebarMax: 360,
  assistantDefault: 400,
  assistantMin: 200,
  assistantMax: 800,
}

// Shared card chrome — used by both the main card and the assistant
// card. Each card adds its own overflow rule on top.
const SHELL_CARD_CLASS =
  "rounded-md border border-border-subtle bg-shell-surface"

// Optional assistant card variant (assistantVariant="dropdown") —
// dropdown/popover-inspired: real `border` (not a ring) + `rounded-lg` +
// popover surface. The panel's own `overflow-y-auto` clips an outer
// ring/box-shadow, so a ring/shadow would be invisible; a border lives inside
// the box → always renders, and `foreground/10` matches the menu dropdown's
// hairline tone exactly.
const ASSISTANT_DROPDOWN_CARD =
  "rounded-lg border border-foreground/10 bg-popover text-popover-foreground"

interface AppShellContextValue {
  /** Whether the assistant panel is currently open. */
  assistantOpen: boolean
  /** Toggle the assistant panel open/closed. */
  toggleAssistant: () => void
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null)

/**
 * Read the enclosing AppShell's assistant-panel state. Returns `null`
 * when called outside an AppShell (e.g. a header rendered standalone in
 * Storybook) so consumers can degrade gracefully.
 */
export function useAppShell(): AppShellContextValue | null {
  return React.useContext(AppShellContext)
}

/**
 * Application shell — absolute-positioned regions on a single canvas.
 *
 * Geometry tokens (in `globals.css`):
 *   --shell-rail-width, --shell-header-height,
 *   --shell-bottom-inset, --shell-right-inset, --shell-handle-width
 *
 * Layout (defaults):
 *   - Rail: 60px wide, top:0, flush left, 8px bottom inset.
 *   - Header: 40px tall, starts to the right of the rail, 16px right
 *     inset.
 *   - Content area: top:40, left:60, right:16, bottom:8 — a plain CSS
 *     flex row. The main card is `flex-1 min-w-0`, so it always tracks
 *     the window width; the assistant card (when open) has a
 *     state-driven px width with a 10px drag handle to its left.
 *   - Inside the main card, sidebar + body are also a flex row. Sidebar
 *     has a state-driven px width; body is `flex-1`.
 *
 * Why flex, not react-resizable-panels: pixel-sized panels in that lib
 * preserve their pixel size and DON'T reflow when the parent element
 * resizes, so the shell froze at its initial width and overflowed on
 * window resize. Plain flex tracks the parent; both the sidebar and the
 * assistant are resized with manual Pointer-Events drag handles.
 *
 * Resize handles (sidebar + assistant):
 *   - Transparent hit area with a 1px line; uses Pointer Events +
 *     `setPointerCapture` so mouse, touch, and pen all work and the drag
 *     follows the pointer outside the element bounds — no `window`
 *     listeners required.
 *
 * Mobile (<md, 768px) — all visibility is CSS-driven (`max-md:` /
 * `md:`), so SSR + first client paint render identical markup (no
 * desktop→mobile flash):
 *   - Rail hidden; header + content span the full width.
 *   - Inline sidebar/assistant panels + drag handles hidden; the same
 *     `sidebar` / `assistant` nodes open in left/right Sheets instead.
 *     `useIsMobile` only routes the toggle handlers post-hydration.
 *   - Optional `bottomNav` renders as a fixed bottom bar; the content
 *     area reserves its height (3.5rem + safe-area inset).
 */
export function AppShell({
  header,
  rail,
  sidebar,
  assistant,
  bottomNav,
  children,
  className,
  assistantVariant = "shell",
  defaultSidebarOpen = true,
  defaultAssistantOpen = false,
  logo = DEFAULT_LOGO,
  logoHref,
}: AppShellProps) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [mobileAssistantOpen, setMobileAssistantOpen] = React.useState(false)
  const [sidebarWidth, setSidebarWidth] = React.useState(SIZES.sidebarDefault)
  const [assistantOpen, setAssistantOpen] = React.useState(defaultAssistantOpen)
  const [assistantWidth, setAssistantWidth] = React.useState(
    SIZES.assistantDefault,
  )
  const dragStateRef = React.useRef<{
    startX: number
    startWidth: number
  } | null>(null)
  const assistantDragRef = React.useRef<{
    startX: number
    startWidth: number
  } | null>(null)

  // Restore body chrome if the component unmounts mid-drag. Pointer
  // capture is auto-released by the browser when the element leaves
  // the DOM, but body styles we mutated need explicit cleanup.
  React.useEffect(() => {
    return () => {
      if (dragStateRef.current || assistantDragRef.current) {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        dragStateRef.current = null
        assistantDragRef.current = null
      }
    }
  }, [])

  // Below md the panels live in Sheets, so the toggles (and the
  // keyboard shortcuts + `useAppShell` consumers) route there. Clicks
  // only happen post-hydration, where `isMobile` is reliable.
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setMobileSidebarOpen((s) => !s)
    else setSidebarOpen((s) => !s)
  }, [isMobile])
  const toggleAssistant = React.useCallback(() => {
    if (isMobile) setMobileAssistantOpen((s) => !s)
    else setAssistantOpen((s) => !s)
  }, [isMobile])
  const assistantIsOpen = isMobile ? mobileAssistantOpen : assistantOpen
  const sidebarIsOpen = isMobile ? mobileSidebarOpen : sidebarOpen
  const shellContext = React.useMemo<AppShellContextValue>(
    () => ({ assistantOpen: assistantIsOpen, toggleAssistant }),
    [assistantIsOpen, toggleAssistant],
  )

  // Crossing up to ≥md closes the mobile sheets so no modal overlay
  // lingers over the desktop layout after a window resize.
  React.useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false)
      setMobileAssistantOpen(false)
    }
  }, [isMobile])

  // Keyboard shortcuts: "B" toggles the sidebar, "S" toggles the
  // assistant. Skipped while typing in a field/contenteditable or when a
  // modifier is held, so they never hijack browser or editor chords.
  const hasSidebar = sidebar !== undefined
  const hasAssistant = assistant !== undefined
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT")
      ) {
        return
      }
      const key = e.key?.toLowerCase()
      if (key === "b" && hasSidebar) {
        e.preventDefault()
        toggleSidebar()
      } else if (key === "s" && hasAssistant) {
        e.preventDefault()
        toggleAssistant()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [hasSidebar, hasAssistant, toggleSidebar, toggleAssistant])

  const onSidebarHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    // Only respond to primary button (mouse) / first contact (touch).
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const onSidebarHandlePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragStateRef.current) return
    const delta = e.clientX - dragStateRef.current.startX
    const next = Math.max(
      SIZES.sidebarMin,
      Math.min(SIZES.sidebarMax, dragStateRef.current.startWidth + delta),
    )
    setSidebarWidth(next)
  }

  const onSidebarHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragStateRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  // Assistant resize: same Pointer-Events drag as the sidebar, but the
  // handle sits to the panel's LEFT, so dragging left GROWS it (inverted
  // delta).
  const onAssistantHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    assistantDragRef.current = { startX: e.clientX, startWidth: assistantWidth }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const onAssistantHandlePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!assistantDragRef.current) return
    const delta = assistantDragRef.current.startX - e.clientX
    const next = Math.max(
      SIZES.assistantMin,
      Math.min(SIZES.assistantMax, assistantDragRef.current.startWidth + delta),
    )
    setAssistantWidth(next)
  }

  const onAssistantHandlePointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!assistantDragRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    assistantDragRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  return (
    <AppShellContext.Provider value={shellContext}>
      <div
        data-slot="app-shell"
        className={cn(
          "relative h-svh w-full overflow-hidden bg-canvas",
          className,
        )}
      >
        {rail !== undefined && (
          <aside
            data-slot="app-shell-rail"
            className="absolute top-0 bottom-[var(--shell-bottom-inset)] left-0 flex w-[var(--shell-rail-width)] flex-col transition-[width] duration-200 ease-in-out max-md:hidden"
          >
            <div
              data-slot="app-shell-logomark"
              className="relative flex h-[var(--shell-header-height)] shrink-0 items-center justify-center overflow-hidden [&>svg]:translate-y-[4px]"
            >
              {logo}
              {logoHref && (
                <a
                  href={logoHref}
                  aria-label="Home"
                  className="absolute top-[11px] left-[14px] h-[26px] w-[32px]"
                />
              )}
            </div>
            <div className="flex-1 overflow-x-hidden overflow-y-auto">
              {rail}
            </div>
          </aside>
        )}

        {header && (
          <header
            data-slot="app-shell-header"
            className="absolute top-0 right-[var(--shell-right-inset)] left-[var(--shell-rail-width)] h-[var(--shell-header-height)] overflow-hidden transition-[left] duration-200 ease-in-out max-md:left-0"
          >
            {header}
          </header>
        )}

        <div
          className={cn(
            "absolute top-[var(--shell-header-height)] right-[var(--shell-right-inset)] bottom-[var(--shell-bottom-inset)] left-[var(--shell-rail-width)] flex transition-[left] duration-200 ease-in-out max-md:left-[var(--shell-right-inset)]",
            bottomNav !== undefined &&
              "max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]",
          )}
        >
          <div
            data-slot="app-shell-content"
            className={cn(
              "relative flex h-full min-w-0 flex-1 overflow-hidden",
              SHELL_CARD_CLASS,
            )}
          >
            {sidebar !== undefined && (
              <>
                <aside
                  data-slot="app-shell-sidebar"
                  style={{ width: sidebarOpen ? sidebarWidth : 0 }}
                  className="shrink-0 overflow-x-hidden overflow-y-auto transition-[width] duration-300 ease-in-out max-md:hidden"
                >
                  {sidebar}
                </aside>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={onSidebarHandlePointerDown}
                  onPointerMove={onSidebarHandlePointerMove}
                  onPointerUp={onSidebarHandlePointerUp}
                  onPointerCancel={onSidebarHandlePointerUp}
                  className={cn(
                    // 4px transparent hit area with 1px line inside
                    // (always visible); the ::before overlay widens the
                    // grab zone to 12px without adding layout width.
                    // `touch-none` blocks the browser's drag-to-scroll
                    // on touch devices so the resize gesture wins.
                    "relative w-1 shrink-0 cursor-col-resize touch-none select-none before:absolute before:-inset-x-1 before:inset-y-0 max-md:hidden",
                    !sidebarOpen && "pointer-events-none invisible",
                  )}
                >
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
                </div>
              </>
            )}
            <main
              data-slot="app-shell-main"
              className="relative h-full flex-1 overflow-auto"
            >
              {sidebar !== undefined && (
                <div className="absolute top-2 left-2 z-10">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={
                      sidebarIsOpen
                        ? isMobile
                          ? "Close sidebar"
                          : "Collapse sidebar"
                        : "Open sidebar"
                    }
                    onClick={toggleSidebar}
                    className="max-md:size-10"
                  >
                    <PanelLeftIcon className="size-4 text-sidekick-icon" />
                  </Button>
                </div>
              )}
              {assistant !== undefined && (
                <div className="absolute top-2 right-2 z-10">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={
                      assistantIsOpen ? "Close assistant" : "Open assistant"
                    }
                    onClick={toggleAssistant}
                    className="max-md:size-10"
                  >
                    <PanelRight className="size-4 text-sidekick-icon" />
                  </Button>
                </div>
              )}
              {children}
            </main>
          </div>

          {assistantOpen && assistant !== undefined && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={onAssistantHandlePointerDown}
                onPointerMove={onAssistantHandlePointerMove}
                onPointerUp={onAssistantHandlePointerUp}
                onPointerCancel={onAssistantHandlePointerUp}
                className="relative w-[var(--shell-handle-width)] shrink-0 cursor-col-resize touch-none bg-transparent select-none before:absolute before:-inset-x-1 before:inset-y-0 max-md:hidden"
              />
              <aside
                data-slot="app-shell-assistant"
                style={{ width: assistantWidth }}
                className={cn(
                  "h-full shrink-0 overflow-x-hidden overflow-y-auto max-md:hidden",
                  assistantVariant === "dropdown"
                    ? ASSISTANT_DROPDOWN_CARD
                    : SHELL_CARD_CLASS,
                )}
              >
                {assistant}
              </aside>
            </>
          )}
        </div>

        {/* Mobile drawers — the SAME sidebar/assistant nodes, presented
            as Sheets below md. Portal content mounts only while open. */}
        {sidebar !== undefined && (
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent side="left" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Sidebar</SheetTitle>
              <div
                data-slot="app-shell-mobile-sidebar"
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
              >
                {sidebar}
              </div>
            </SheetContent>
          </Sheet>
        )}
        {assistant !== undefined && (
          <Sheet
            open={mobileAssistantOpen}
            onOpenChange={setMobileAssistantOpen}
          >
            <SheetContent side="right" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Assistant</SheetTitle>
              <div
                data-slot="app-shell-mobile-assistant"
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
              >
                {assistant}
              </div>
            </SheetContent>
          </Sheet>
        )}

        {bottomNav !== undefined && (
          <div
            data-slot="app-shell-bottom-nav"
            className="absolute inset-x-0 bottom-0 md:hidden"
          >
            {bottomNav}
          </div>
        )}
      </div>
    </AppShellContext.Provider>
  )
}
