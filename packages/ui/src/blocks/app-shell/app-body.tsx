"use client"

import * as React from "react"

import { IconButton } from "@workspace/ui/components/icon-button"
import type { ResizeHandlers } from "@workspace/ui/lib/use-resize-handle"
import { cn } from "@workspace/ui/lib/utils"

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

interface AppBodyProps {
  // ── slot nodes (presence checks drive layout) ──
  sidebar?: React.ReactNode
  sidebarHeader?: React.ReactNode
  contentHeader?: React.ReactNode
  assistant?: React.ReactNode
  children?: React.ReactNode
  assistantVariant: "shell" | "dropdown"

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
          className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
        >
          <PanelHeader>
            {(!sidebarIsOpen || isMobile) && renderSidebarToggle("left")}
            {contentHeader != null && (
              <div className="ml-1 min-w-0 flex-1">{contentHeader}</div>
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
  )
}
