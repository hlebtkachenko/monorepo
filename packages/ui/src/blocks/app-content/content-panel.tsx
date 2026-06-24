import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

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
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string
  /** The scrolling body content (table / cards / detail). */
  children: React.ReactNode
}

/**
 * The content panel body — everything BELOW the shell's 45px panel header.
 * Vertical stack that fills the panel: a fixed toolbar, an optional filter
 * band, a single scrolling body, an optional status bar, and the floating
 * action bar. Only the body scrolls; the chrome rows stay pinned.
 *
 * The shell's panel header (with the page title + tabs via the `contentHeader`
 * slot) sits ABOVE this — this component owns rows 2…n.
 */
export function ContentPanel({
  toolbar,
  filters,
  statusBar,
  actionBar,
  bodyClassName,
  children,
}: ContentPanelProps) {
  return (
    <div data-slot="content-panel" className="flex h-full min-h-0 flex-col">
      {toolbar}
      {filters}
      <div
        data-slot="content-body"
        className={cn("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}
      >
        {children}
      </div>
      {statusBar}
      {actionBar}
    </div>
  )
}
