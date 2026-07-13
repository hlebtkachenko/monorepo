"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useResizeHandle } from "@workspace/ui/lib/use-resize-handle"

/** How the inspector (element-detail view) is presented. */
export type InspectorMode = "panel" | "dialog"

export interface InspectorProps {
  /** Detail content of the selected body element. */
  children: React.ReactNode
  /** Whether the inspector is currently shown. */
  open: boolean
  /** panel = right-docked resizable side panel; dialog = centered modal. */
  mode?: InspectorMode
  /** Fired with `false` when the user dismisses (X / dialog overlay). */
  onOpenChange?: (open: boolean) => void
  /** Header title (panel band + dialog a11y name). */
  title?: React.ReactNode
  /**
   * A footer pinned to the BOTTOM of the inspector, OUTSIDE its scroll region —
   * for the primary actions on the inspected element (approve / reject / save).
   * Stays put while the detail body scrolls. Omit for a scroll-only inspector.
   */
  footer?: React.ReactNode
}

const INSPECTOR = { default: 380, min: 280, max: 680 }

/**
 * The Inspector — the right-docked detail surface for the element chosen in the
 * content body (an invoice, a transaction, …). Two presentations via `mode`:
 *   - `"panel"`  → a resizable side panel docked at the body's right edge
 *     (warm `--inspector-surface` bg). Renders as a flex sibling of the body.
 *   - `"dialog"` → a centred modal (portals out, so tree position is irrelevant).
 * Renders `null` when closed or when `children` is absent. Toggled by the
 * toolbar's Mode Toggle; state is owned per-page.
 */
export function Inspector({
  children,
  open,
  mode = "panel",
  onOpenChange,
  title,
  footer,
}: InspectorProps) {
  const [width, setWidth] = React.useState(INSPECTOR.default)
  // Handle sits on the inspector's LEFT edge → dragging left grows it.
  const handle = useResizeHandle({
    width,
    setWidth,
    min: INSPECTOR.min,
    max: INSPECTOR.max,
    invert: true,
  })

  const show = children != null && open === true
  if (!show) return null

  if (mode === "dialog") {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
          {footer ? (
            <div className="border-t border-border-subtle pt-3">{footer}</div>
          ) : null}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handle.onPointerDown}
        onPointerMove={handle.onPointerMove}
        onPointerUp={handle.onPointerUp}
        onPointerCancel={handle.onPointerUp}
        onLostPointerCapture={handle.onPointerUp}
        className="relative w-px shrink-0 cursor-col-resize touch-none bg-border-subtle select-none before:absolute before:-inset-x-1 before:inset-y-0 max-md:hidden"
      />
      <aside
        data-slot="content-inspector"
        style={{ width }}
        className="flex shrink-0 flex-col overflow-hidden bg-inspector-surface max-md:hidden"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
            {title}
          </span>
          {/* The close control only appears when the panel is dismissible
              (a change handler is wired). An always-docked inspector
              (no handler) shows no dead "Close" button. */}
          {onOpenChange ? (
            <IconButton
              icon="X"
              aria-label="Close inspector"
              tooltip="Close"
              tooltipSide="bottom"
              onClick={() => onOpenChange(false)}
            />
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
        {footer ? (
          <div
            data-slot="content-inspector-footer"
            className="shrink-0 border-t border-border-subtle p-3"
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  )
}
