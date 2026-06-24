"use client"

import * as React from "react"

import { Logo } from "@workspace/ui/brand-assets"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Sheet, SheetContent, SheetTitle } from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"

import { useResizeHandle, type ResizeHandlers } from "./use-resize-handle"

interface AppShellProps {
  header?: React.ReactNode
  rail?: React.ReactNode
  sidebar?: React.ReactNode
  /**
   * Title content for the sidebar panel's header bar (left of the
   * collapse toggle) — typically the active Module name. Truncates.
   */
  sidebarHeader?: React.ReactNode
  /**
   * Header content for the CONTENT panel's 45px header bar — typically the
   * active Page/Subpage title + its tabs (compose with the app-content
   * block's `ContentHeader`). Sits between the sidebar toggle (left) and the
   * assistant toggle (right). The body (rows below the header) is `children`.
   */
  contentHeader?: React.ReactNode
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
// card. The main card adds `overflow-hidden` inline; the assistant card
// scrolls on its inner body, not the card itself.
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

// Per-panel header bar: full width, 45px tall, bottom hairline in the shell
// border tone (same token the panels/rail use). Every panel (sidebar /
// content / assistant) opens with one; it holds the panel's open/close
// toggle(s) and, later, its title content.
//
// Inside sits the "safe zone": content is inset 8px on the sides and 6px top/
// bottom (the header's padding). 45 − 1px border − 12px = a 32px content row,
// exactly the toggle height.
function PanelHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-slot="app-shell-panel-header"
      className="flex h-[45px] shrink-0 items-stretch border-b border-border-subtle px-2 py-1.5"
    >
      <div
        data-slot="app-shell-panel-header-safe-zone"
        className="flex flex-1 items-center gap-1"
      >
        {children}
      </div>
    </div>
  )
}

// Vertical resize handle between two panels: a zero-/handle-width strip that
// captures the drag (transparent ~8px grab zone via the `before` overlay) and
// hides below md. The five pointer events are wired here so the sidebar and
// assistant handles can never drift out of sync. Children render inside (the
// sidebar passes a 1px divider line).
function ResizeHandle({
  handlers,
  className,
  children,
}: {
  handlers: ResizeHandlers
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerUp}
      onLostPointerCapture={handlers.onPointerUp}
      className={cn(
        "relative shrink-0 cursor-col-resize touch-none select-none before:absolute before:-inset-x-1 before:inset-y-0 max-md:hidden",
        className,
      )}
    >
      {children}
    </div>
  )
}

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
  sidebarHeader,
  contentHeader,
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
  // Both panels resize with the same Pointer-Events drag (manual, not
  // react-resizable-panels — see the SIZES note). The hook owns the per-drag
  // state + body-chrome cleanup; the assistant handle sits on the panel's LEFT,
  // so its delta is inverted (drag left grows it).
  const sidebarHandle = useResizeHandle({
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    min: SIZES.sidebarMin,
    max: SIZES.sidebarMax,
  })
  const assistantHandle = useResizeHandle({
    width: assistantWidth,
    setWidth: setAssistantWidth,
    min: SIZES.assistantMin,
    max: SIZES.assistantMax,
    invert: true,
  })

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

  // The sidebar's open/close toggle lives in two places depending on state:
  // when the sidebar is open (desktop), it sits in the SIDEBAR panel's own
  // header, right-aligned; when closed — or always on mobile, where the
  // sidebar is a Sheet and its inline header is hidden — it sits in the
  // CONTENT header instead. Same button, different parent.
  const renderSidebarToggle = (align: "left" | "right") =>
    sidebar !== undefined ? (
      <IconButton
        icon={sidebarIsOpen ? "PanelLeftClose" : "PanelLeftOpen"}
        aria-label={
          sidebarIsOpen
            ? isMobile
              ? "Close sidebar"
              : "Collapse sidebar"
            : "Open sidebar"
        }
        tooltip={sidebarIsOpen ? "Collapse" : "Expand"}
        tooltipSide="bottom"
        onClick={toggleSidebar}
        className={cn(
          // Soften the teleport between the two headers: fade + slight
          // zoom in wherever it mounts, instead of a hard pop.
          "animate-in duration-200 fade-in-0 zoom-in-95 max-md:size-10",
          align === "right" && "ml-auto",
        )}
      />
    ) : null

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
                  className="flex shrink-0 flex-col overflow-hidden transition-[width] duration-300 ease-in-out max-md:hidden"
                >
                  <PanelHeader>
                    {sidebarHeader != null && (
                      <div className="ml-2 min-w-0 flex-1">{sidebarHeader}</div>
                    )}
                    {sidebarIsOpen && renderSidebarToggle("right")}
                  </PanelHeader>
                  <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                    {sidebar}
                  </div>
                </aside>
                {/* Zero layout width: the sidebar + content panels touch, so
                    their header bottom-borders connect into one line with only
                    the 1px divider crossing — no card-surface gap. The ::before
                    overlay still gives an ~8px grab zone; z-10 keeps the hit
                    area above the adjacent panel content. */}
                <ResizeHandle
                  handlers={sidebarHandle}
                  className={cn(
                    "z-10 w-0",
                    !sidebarOpen && "pointer-events-none invisible",
                  )}
                >
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
                </ResizeHandle>
              </>
            )}
            <main
              data-slot="app-shell-main"
              className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
            >
              <PanelHeader>
                {(!sidebarIsOpen || isMobile) && renderSidebarToggle("left")}
                {contentHeader != null && (
                  <div className="ml-1 min-w-0 flex-1">{contentHeader}</div>
                )}
                {assistant !== undefined && (
                  <IconButton
                    icon={
                      assistantIsOpen ? "PanelRightClose" : "PanelRightOpen"
                    }
                    aria-label={
                      assistantIsOpen
                        ? isMobile
                          ? "Close assistant"
                          : "Collapse assistant"
                        : "Open assistant"
                    }
                    tooltip={assistantIsOpen ? "Collapse" : "Expand"}
                    tooltipSide="bottom"
                    onClick={toggleAssistant}
                    className="ml-auto max-md:size-10"
                  />
                )}
              </PanelHeader>
              <div className="relative min-h-0 flex-1 overflow-auto">
                {children}
              </div>
            </main>
          </div>

          {assistantOpen && assistant !== undefined && (
            <>
              <ResizeHandle
                handlers={assistantHandle}
                className="w-[var(--shell-handle-width)] bg-transparent"
              />
              <aside
                data-slot="app-shell-assistant"
                style={{ width: assistantWidth }}
                className={cn(
                  "flex h-full shrink-0 flex-col overflow-hidden max-md:hidden",
                  assistantVariant === "dropdown"
                    ? ASSISTANT_DROPDOWN_CARD
                    : SHELL_CARD_CLASS,
                )}
              >
                {/* Empty header reserves the 45px band so the assistant's
                    bottom hairline aligns with the sidebar + content headers —
                    the assistant's own toggle lives in the content header. */}
                <PanelHeader />
                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                  {assistant}
                </div>
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
