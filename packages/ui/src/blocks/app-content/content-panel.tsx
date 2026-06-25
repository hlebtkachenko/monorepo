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
import { cn } from "@workspace/ui/lib/utils"

/** How the inspector (element-detail view) is presented. */
export type InspectorMode = "panel" | "dialog"

export interface ContentPanelProps {
  /** The 36px toolbar row (usually a `ContentToolbar`). Optional. */
  toolbar?: React.ReactNode
  /**
   * An optional band BELOW the toolbar for a filter bar (e.g. the data-table
   * toolbar). Kept separate from the toolbar so the toolbar height never jumps
   * — filters can wrap / grow on their own row. Toggle by passing/omitting it.
   */
  filters?: React.ReactNode
  /** The optional 24px status bar pinned at the bottom (a `ContentStatusBar`). */
  statusBar?: React.ReactNode
  /** The floating bulk-action bar (an `ActionBar`). Rendered as-is. */
  actionBar?: React.ReactNode
  /**
   * The Inspector — detail of the element chosen in the body (an invoice, a
   * transaction, …). Presented two ways (user's choice via `inspectorMode`):
   *   - `"panel"`  → a resizable side panel docked between the toolbar and the
   *     status bar (warm `--inspector-surface` bg).
   *   - `"dialog"` → a centred modal (normal white surface).
   * Omit `inspector` (or pass `inspectorOpen=false`) to show neither.
   */
  inspector?: React.ReactNode
  inspectorOpen?: boolean
  inspectorMode?: InspectorMode
  onInspectorOpenChange?: (open: boolean) => void
  /** Title shown in the panel header / dialog header (also the dialog a11y name). */
  inspectorTitle?: React.ReactNode
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string
  /** The scrolling body content (table / cards / detail). */
  children: React.ReactNode
}

const INSPECTOR = { default: 380, min: 280, max: 680 }

/**
 * The content panel body — everything BELOW the shell's 45px panel header.
 * Vertical stack that fills the panel: a fixed toolbar, an optional filter
 * band, the body row (the scrolling body + an optional Inspector panel beside
 * it), an optional status bar, and the floating action bar. Only the body and
 * the inspector scroll; the chrome rows stay pinned.
 *
 * The shell's panel header (with the page title + tabs via the `contentHeader`
 * slot) sits ABOVE this — this component owns rows 2…n.
 */
export function ContentPanel({
  toolbar,
  filters,
  statusBar,
  actionBar,
  inspector,
  inspectorOpen,
  inspectorMode = "panel",
  onInspectorOpenChange,
  inspectorTitle,
  bodyClassName,
  children,
}: ContentPanelProps) {
  const [inspectorWidth, setInspectorWidth] = React.useState(INSPECTOR.default)
  // Handle sits on the inspector's LEFT edge → dragging left grows it.
  const handle = useResizeHandle({
    width: inspectorWidth,
    setWidth: setInspectorWidth,
    min: INSPECTOR.min,
    max: INSPECTOR.max,
    invert: true,
  })

  const hasInspector = inspector != null && inspectorOpen === true
  const showPanel = hasInspector && inspectorMode === "panel"
  const showDialog = hasInspector && inspectorMode === "dialog"

  return (
    <div data-slot="content-panel" className="flex h-full min-h-0 flex-col">
      {toolbar}
      {filters}
      <div data-slot="content-row" className="flex min-h-0 flex-1">
        <div
          data-slot="content-body"
          className={cn("min-w-0 flex-1 overflow-auto p-3", bodyClassName)}
        >
          {children}
        </div>
        {showPanel ? (
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
              style={{ width: inspectorWidth }}
              className="flex shrink-0 flex-col overflow-hidden bg-inspector-surface max-md:hidden"
            >
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
                <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
                  {inspectorTitle}
                </span>
                <IconButton
                  icon="X"
                  aria-label="Close inspector"
                  tooltip="Close"
                  tooltipSide="bottom"
                  onClick={() => onInspectorOpenChange?.(false)}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {inspector}
              </div>
            </aside>
          </>
        ) : null}
      </div>
      {statusBar}
      {actionBar}

      {showDialog ? (
        <Dialog open onOpenChange={onInspectorOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inspectorTitle}</DialogTitle>
            </DialogHeader>
            {inspector}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
