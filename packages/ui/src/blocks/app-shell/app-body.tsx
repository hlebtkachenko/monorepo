"use client"

import * as React from "react"

import { IconButton } from "@workspace/ui/components/icon-button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { InspectorSheet } from "@workspace/ui/blocks/inspector-sheet"
import {
  useResizeHandle,
  type ResizeHandlers,
} from "@workspace/ui/lib/use-resize-handle"
import { cn } from "@workspace/ui/lib/utils"

import {
  AppInspectorRailProvider,
  useAppInspectorRail,
} from "./app-inspector-rail"

/** Inspector-rail width bounds (px) — mirrors the assistant panel's sizing. */
const INSPECTOR_RAIL = { default: 500, min: 420, max: 960 }

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

// Per-panel header bar: full width, 42px tall (excl. its 1px bottom hairline),
// in the shell border tone (same token the panels/rail use). Every panel
// (sidebar / content / assistant) opens with one; it holds the panel's
// open/close toggle(s) and its title content.
//
// Inside sits the "safe zone": content is inset 8px on the sides and 4px top/
// bottom (the header's padding). 42 − 1px border − 8px = a 33px content row,
// which clears the 32px toggle height.
function PanelHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-slot="app-shell-panel-header"
      className="flex h-[42px] shrink-0 items-stretch border-b border-border-subtle px-2 py-1"
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
  onPointerEnter,
  onPointerLeave,
}: {
  handlers: ResizeHandlers & {
    /** Cleanup-only path for pointercancel/lostpointercapture — must NOT
     * run click-vs-drag logic, only `onPointerUp` runs on a real pointerup. */
    onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void
  }
  className?: string
  children?: React.ReactNode
  onPointerEnter?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerLeave?: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const onPointerCancel = handlers.onPointerCancel ?? handlers.onPointerUp
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "relative shrink-0 cursor-col-resize touch-none select-none before:absolute before:-inset-x-1 before:inset-y-0 max-md:hidden",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Movement (px) below which a pointerdown→pointerup on the Inspector
 * resize handle counts as a click (collapse) rather than a drag. */
const INSPECTOR_HANDLE_CLICK_THRESHOLD = 4

// The record inspector — a full-height rail docked at the content card's right
// edge (a flex sibling of `main`, so it SHRINKS the content, never overlays it,
// no scrim, page stays live). Renders a 40px `InspectorHeader` plus the
// composed `InspectorSheet` body; resizable from its left edge. Open state +
// breadcrumb + record data come from the active page via the
// `AppInspectorRail` context.
function InspectorAside() {
  const rail = useAppInspectorRail()
  const [width, setWidth] = React.useState(INSPECTOR_RAIL.default)
  const handle = useResizeHandle({
    width,
    setWidth,
    min: INSPECTOR_RAIL.min,
    max: INSPECTOR_RAIL.max,
    invert: true,
  })
  // Click-vs-drag disambiguation + hover tooltip live only on the Inspector's
  // handle: a genuine click (pointer never crossed the threshold) collapses
  // the rail, while any pointer path that crosses the threshold — even if it
  // later returns near the start — is a drag and must not also collapse.
  const pointerDownAt = React.useRef<{ x: number; y: number } | null>(null)
  const crossedThreshold = React.useRef(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [hoverY, setHoverY] = React.useState<number | null>(null)

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only a primary-button press starts click/drag tracking — a right/
    // middle click must never collapse the rail.
    if (e.button !== 0) return
    pointerDownAt.current = { x: e.clientX, y: e.clientY }
    crossedThreshold.current = false
    setIsDragging(true)
    handle.onPointerDown(e)
  }
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerDownAt.current
    if (!start) return
    if (!crossedThreshold.current) {
      const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      if (distance < INSPECTOR_HANDLE_CLICK_THRESHOLD) return
      crossedThreshold.current = true
    }
    // Forward the current move so width catches up to the full delta the
    // moment the threshold is crossed, instead of skipping the first jump.
    handle.onPointerMove(e)
  }
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // No tracked pointerdown (e.g. a non-primary press was ignored) — nothing
    // to resolve.
    if (!pointerDownAt.current) return
    const drag = crossedThreshold.current
    pointerDownAt.current = null
    crossedThreshold.current = false
    setIsDragging(false)
    // Clear local refs before handle.onPointerUp — it releases pointer
    // capture, which can synchronously dispatch lostpointercapture back into
    // this component.
    handle.onPointerUp(e)
    if (!drag) {
      // No pointerleave fires once the handle unmounts on collapse — clear
      // the tooltip anchor now so a later reopen doesn't reuse a stale hoverY.
      setHoverY(null)
      rail.onClose()
    }
  }
  const onHandlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    // pointercancel / lostpointercapture — cleanup only, never collapse.
    if (!pointerDownAt.current) return
    pointerDownAt.current = null
    crossedThreshold.current = false
    setIsDragging(false)
    handle.onPointerUp(e)
  }
  const onHandlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    setHoverY(e.clientY - e.currentTarget.getBoundingClientRect().top)
  }
  const onHandlePointerLeave = () => setHoverY(null)

  if (!rail.open) return null
  return (
    <>
      {/* Zero-width handle keeps layout stable. Hover reveals a thicker neutral
          divider without competing with record actions for accent colour. */}
      <TooltipProvider>
        <Tooltip open={hoverY !== null && !isDragging}>
          <ResizeHandle
            handlers={{
              onPointerDown: onHandlePointerDown,
              onPointerMove: onHandlePointerMove,
              onPointerUp: onHandlePointerUp,
              onPointerCancel: onHandlePointerCancel,
            }}
            className="group z-20 w-0"
            onPointerEnter={onHandlePointerEnter}
            onPointerLeave={onHandlePointerLeave}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle transition-all duration-150 group-hover:w-[3px] group-hover:bg-muted-foreground/50" />
            <TooltipTrigger asChild>
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 size-px"
                style={{ top: hoverY ?? 0 }}
              />
            </TooltipTrigger>
          </ResizeHandle>
          <TooltipContent side="right" sideOffset={8}>
            <div className="flex flex-col gap-0.5">
              <span>Drag to resize</span>
              <span>Click to collapse</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <aside
        data-slot="app-shell-inspector"
        style={{ width }}
        className="relative z-10 flex shrink-0 flex-col overflow-hidden bg-shell-surface shadow-[-3px_0_8px_-6px] shadow-muted-foreground/25 max-md:hidden"
      >
        <InspectorSheet
          className="min-h-0 flex-1"
          breadcrumb={rail.breadcrumb}
          onPrevious={rail.onPrevious}
          onNext={rail.onNext}
          onCopy={rail.onCopy}
          onSwitchLayout={rail.onSwitchLayout}
          onClose={rail.onClose}
          name={rail.name}
          onNameChange={rail.onNameChange}
          flag={rail.flag}
          onFlagChange={rail.onFlagChange}
          badge={rail.badge}
          footer={rail.footer}
          content={rail.content}
          activeTab={rail.activeTab}
          onTabChange={rail.onTabChange}
        />
      </aside>
    </>
  )
}

interface AppBodyProps {
  // ── slot nodes (presence checks drive layout) ──
  sidebar?: React.ReactNode
  sidebarHeader?: React.ReactNode
  contentHeader?: React.ReactNode
  assistant?: React.ReactNode
  children?: React.ReactNode
  assistantVariant: "shell" | "dropdown"
  /** Accessible name for the `<main>` landmark (the skip-link target). */
  mainLabel: string

  // ── resolved layout state (owned by AppShell, passed down) ──
  isMobile: boolean
  /** Desktop sidebar open flag — drives the inline width (0 when closed). */
  sidebarOpen: boolean
  /** Effective open flag (mobile-aware) — drives the toggle glyph + handle. */
  sidebarIsOpen: boolean
  sidebarWidth: number
  /** Desktop assistant open flag — gates the inline assistant aside mount. */
  assistantOpen: boolean
  /** Effective open flag (mobile-aware) — drives the assistant toggle glyph. */
  assistantIsOpen: boolean
  assistantWidth: number
  hasBottomNav: boolean

  // ── handlers / render props (state stays in AppShell) ──
  sidebarHandle: ResizeHandlers
  assistantHandle: ResizeHandlers
  toggleAssistant: () => void
  /**
   * Renders the sidebar collapse toggle at the given alignment. Supplied by
   * AppShell (it closes over `toggleSidebar` + `sidebarIsOpen` + `isMobile`)
   * so the single source of toggle state is preserved across the two mount
   * points (sidebar-panel header, right; content-main header, left).
   */
  renderSidebarToggle: (align: "left" | "right") => React.ReactNode
}

/**
 * AppBody — the panel-row region of the shell (sidebar | content-main |
 * assistant), positioned below the header and right of the rail. A pure
 * presentational component: it owns the layout DOM but **all state lives in
 * AppShell** and is threaded in via props (assistant state is read outside the
 * body by header actions, and the mobile Sheets are shell-root siblings, so the
 * body can't own that state). Not exported from the block.
 */
export function AppBody({
  sidebar,
  sidebarHeader,
  contentHeader,
  assistant,
  children,
  assistantVariant,
  mainLabel,
  isMobile,
  sidebarOpen,
  sidebarIsOpen,
  sidebarWidth,
  assistantOpen,
  assistantIsOpen,
  assistantWidth,
  hasBottomNav,
  sidebarHandle,
  assistantHandle,
  toggleAssistant,
  renderSidebarToggle,
}: AppBodyProps) {
  return (
    <AppInspectorRailProvider>
      <div
        data-slot="app-shell-body"
        className={cn(
          "absolute top-[var(--shell-header-height)] right-[var(--shell-right-inset)] bottom-[var(--shell-bottom-inset)] left-[var(--shell-rail-width)] flex transition-[left] duration-200 ease-in-out max-md:left-[var(--shell-right-inset)]",
          hasBottomNav &&
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
            // Named main landmark + `tabIndex={-1}` so the shell-level
            // "skip to content" link can move keyboard focus straight here,
            // bypassing the rail/sidebar on every page.
            id="main-content"
            aria-label={mainLabel}
            tabIndex={-1}
            className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden outline-none"
          >
            <PanelHeader>
              {(!sidebarIsOpen || isMobile) && renderSidebarToggle("left")}
              {contentHeader != null && (
                // `self-stretch` fills the full bar height so the view-tab underline
                // can reach the header's bottom hairline (no 1px gap).
                <div className="ml-2 min-w-0 flex-1 self-stretch">
                  {contentHeader}
                </div>
              )}
              {assistant !== undefined && (
                <IconButton
                  icon={assistantIsOpen ? "PanelRightClose" : "PanelRightOpen"}
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
            {/* The panel body fills the main column and does NOT scroll as a
              whole — surfaces (e.g. ContentPanel) keep their chrome fixed
              and scroll their own inner regions (table rows, inspector). */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {children}
            </div>
          </main>
          <InspectorAside />
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
    </AppInspectorRailProvider>
  )
}
