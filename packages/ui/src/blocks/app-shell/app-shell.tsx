"use client"

import * as React from "react"

import { Logo } from "@workspace/ui/brand-assets"
import { Button } from "@workspace/ui/components/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@workspace/ui/components/resizable"
import { PanelLeftIcon, PanelRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

interface AppShellProps {
  header?: React.ReactNode
  rail?: React.ReactNode
  sidebar?: React.ReactNode
  assistant?: React.ReactNode
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
   *     resizable-panel wrapper clips it (see ASSISTANT_DROPDOWN_CARD).
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

// Single source of truth for sizes. JS values used by drag clamps;
// `MAIN_MIN_WIDTH` is a string because react-resizable-panels expects
// string sizes with a "px" suffix and doesn't accept CSS vars.
const SIZES: {
  sidebarDefault: number
  sidebarMin: number
  sidebarMax: number
  assistantDefault: string
  assistantMin: string
  assistantMax: string
  mainMin: string
} = {
  sidebarDefault: 236,
  sidebarMin: 160,
  sidebarMax: 360,
  assistantDefault: "400px",
  assistantMin: "200px",
  assistantMax: "800px",
  mainMin: "400px",
}

// Shared card chrome — used by both the main card and the assistant
// card. Each card adds its own overflow rule on top.
const SHELL_CARD_CLASS =
  "rounded-md border border-border-subtle bg-shell-surface"

// Optional assistant card variant (assistantVariant="dropdown") —
// dropdown/popover-inspired: real `border` (not a ring) + `rounded-lg` +
// popover surface. The panel lives inside a react-resizable-panels wrapper
// whose `overflow:auto` clips outer ring/box-shadow, so a ring/shadow would
// be invisible; a border lives inside the box → always renders, and
// `foreground/10` matches the menu dropdown's hairline tone exactly.
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
 *   - Content area: top:40, left:60, right:16, bottom:8.
 *   - Inside the content area, an OUTER `ResizablePanelGroup` splits
 *     the main card and the assistant card with a 10px-wide drag
 *     handle.
 *   - Inside the main card, sidebar + body use a plain CSS flex layout
 *     (NOT a ResizablePanelGroup). Sidebar has a state-driven px width;
 *     body is `flex-1`. This guarantees the sidebar width never changes
 *     when the OUTER (main↔assistant) handle is dragged — only the
 *     body absorbs that delta.
 *
 * Sidebar resize handle:
 *   - 4px-wide transparent hit area with a 1px line inside that's
 *     visible only on hover (`group-hover:opacity-100`).
 *   - Uses Pointer Events + `setPointerCapture` so mouse, touch, and
 *     pen all work and the drag follows the pointer outside the
 *     element bounds — no `window` listeners required.
 */
export function AppShell({
  header,
  rail,
  sidebar,
  assistant,
  children,
  className,
  assistantVariant = "shell",
  defaultSidebarOpen = true,
  defaultAssistantOpen = false,
  logo = DEFAULT_LOGO,
  logoHref,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen)
  const [sidebarWidth, setSidebarWidth] = React.useState(SIZES.sidebarDefault)
  const [assistantOpen, setAssistantOpen] = React.useState(defaultAssistantOpen)
  const dragStateRef = React.useRef<{
    startX: number
    startWidth: number
  } | null>(null)

  // Restore body chrome if the component unmounts mid-drag. Pointer
  // capture is auto-released by the browser when the element leaves
  // the DOM, but body styles we mutated need explicit cleanup.
  React.useEffect(() => {
    return () => {
      if (dragStateRef.current) {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        dragStateRef.current = null
      }
    }
  }, [])

  const toggleSidebar = React.useCallback(() => setSidebarOpen((s) => !s), [])
  const toggleAssistant = React.useCallback(
    () => setAssistantOpen((s) => !s),
    [],
  )
  const shellContext = React.useMemo<AppShellContextValue>(
    () => ({ assistantOpen, toggleAssistant }),
    [assistantOpen, toggleAssistant],
  )

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
            className="absolute top-0 bottom-[var(--shell-bottom-inset)] left-0 flex w-[var(--shell-rail-width)] flex-col transition-[width] duration-200 ease-in-out"
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
            className="absolute top-0 right-[var(--shell-right-inset)] left-[var(--shell-rail-width)] h-[var(--shell-header-height)] overflow-hidden transition-[left] duration-200 ease-in-out"
          >
            {header}
          </header>
        )}

        <div className="absolute top-[var(--shell-header-height)] right-[var(--shell-right-inset)] bottom-[var(--shell-bottom-inset)] left-[var(--shell-rail-width)] transition-[left] duration-200 ease-in-out">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel minSize={SIZES.mainMin}>
              <div
                data-slot="app-shell-content"
                className={cn(
                  "relative flex h-full overflow-hidden",
                  SHELL_CARD_CLASS,
                )}
              >
                {sidebar !== undefined && (
                  <>
                    <aside
                      data-slot="app-shell-sidebar"
                      style={{ width: sidebarOpen ? sidebarWidth : 0 }}
                      className="shrink-0 overflow-x-hidden overflow-y-auto transition-[width] duration-300 ease-in-out"
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
                        // (always visible). `touch-none` blocks the
                        // browser's drag-to-scroll on touch devices so
                        // the resize gesture wins.
                        "relative w-1 shrink-0 cursor-col-resize touch-none select-none",
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
                          sidebarOpen ? "Collapse sidebar" : "Open sidebar"
                        }
                        onClick={toggleSidebar}
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
                          assistantOpen ? "Close assistant" : "Open assistant"
                        }
                        onClick={toggleAssistant}
                      >
                        <PanelRight className="size-4 text-sidekick-icon" />
                      </Button>
                    </div>
                  )}
                  {children}
                </main>
              </div>
            </ResizablePanel>

            {assistantOpen && assistant !== undefined && (
              <>
                <ResizableHandle className="w-[var(--shell-handle-width)] bg-transparent" />
                <ResizablePanel
                  defaultSize={SIZES.assistantDefault}
                  minSize={SIZES.assistantMin}
                  maxSize={SIZES.assistantMax}
                  data-slot="app-shell-assistant"
                >
                  <aside
                    className={cn(
                      "h-full overflow-x-hidden overflow-y-auto",
                      assistantVariant === "dropdown"
                        ? ASSISTANT_DROPDOWN_CARD
                        : SHELL_CARD_CLASS,
                    )}
                  >
                    {assistant}
                  </aside>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
