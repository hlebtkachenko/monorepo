"use client"

import * as React from "react"

import { Logo } from "@workspace/ui/brand-assets"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Sheet, SheetContent, SheetTitle } from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useResizeHandle } from "@workspace/ui/lib/use-resize-handle"
import { cn } from "@workspace/ui/lib/utils"

import { AppBody } from "./app-body"

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
   * visible artwork area (~32×26 inside the 70×40 rail-header zone) —
   * so the gray breathing-room is NOT clickable, only the logo
   * pixels. For Next.js client-side navigation, pass a wrapped
   * `<Link>` via the `logo` prop instead.
   */
  logoHref?: string
  /**
   * Lets `logo` render wider than the 70×40 rail-header zone (e.g. a
   * combined logomark+wordmark lockup) without being clipped. The mark
   * itself stays pinned at the zone's usual top-left position; only the
   * right edge is free to extend — into the header's territory — because
   * the logo paints as a top-layer overlay (after the header in DOM,
   * `overflow-visible`) instead of living inside the rail's clipped box.
   * Default `false`: identical pixel output to today for any square logo.
   */
  logoOverflow?: boolean
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
  logoOverflow = false,
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
              className={cn(
                "relative flex h-[var(--shell-header-height)] shrink-0 items-center justify-center overflow-hidden [&>svg]:translate-y-[4px]",
                logoOverflow && "invisible",
              )}
            >
              {!logoOverflow && logo}
              {!logoOverflow && logoHref && (
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

        {/* Overflow logo overlay — paints AFTER (on top of) both the rail and
            the header, so a lockup wider than the rail-header zone (e.g. a
            combined logomark+wordmark) bleeds rightward into the header's
            territory unclipped. Pinned at the same top-left origin the
            rail's logomark box always used. */}
        {rail !== undefined && logoOverflow && (
          <div
            data-slot="app-shell-logo-overlay"
            className="pointer-events-none absolute top-0 left-0 z-10 flex h-[var(--shell-header-height)] items-center overflow-visible max-md:hidden [&>svg]:translate-y-[4px]"
          >
            {/* `relative` + `inset-0` (not a hardcoded box like the default
                path's 26×32) so the click target always matches whatever
                width the wider lockup renders at, logomark through
                wordmark — no magic number to drift when the artwork
                changes. */}
            <div className="pointer-events-auto relative">
              {logo}
              {logoHref && (
                <a
                  href={logoHref}
                  aria-label="Home"
                  className="absolute inset-0"
                />
              )}
            </div>
          </div>
        )}

        <AppBody
          sidebar={sidebar}
          sidebarHeader={sidebarHeader}
          contentHeader={contentHeader}
          assistant={assistant}
          assistantVariant={assistantVariant}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
          sidebarIsOpen={sidebarIsOpen}
          sidebarWidth={sidebarWidth}
          assistantOpen={assistantOpen}
          assistantIsOpen={assistantIsOpen}
          assistantWidth={assistantWidth}
          hasBottomNav={bottomNav !== undefined}
          sidebarHandle={sidebarHandle}
          assistantHandle={assistantHandle}
          toggleAssistant={toggleAssistant}
          renderSidebarToggle={renderSidebarToggle}
        >
          {children}
        </AppBody>

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
