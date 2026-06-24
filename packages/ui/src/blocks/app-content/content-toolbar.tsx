import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface ContentToolbarProps {
  /** Left cluster — context / view controls (count, view switch, …). */
  left?: React.ReactNode
  /** Right cluster — page actions (filter toggle, primary action, …). */
  right?: React.ReactNode
  className?: string
}

/**
 * The content panel's toolbar row — a fixed 36px band under the header, same
 * chrome as the header (full width, side padding, hairline bottom border).
 *
 * Strong, stable layout on purpose: two slots (`left` / `right`) that pages
 * fill with their own controls. Keep it to page-level actions that apply
 * broadly (filter toggle, view switch, primary "add"). Row/selection actions
 * do NOT belong here — those live in the floating ActionBar.
 */
export function ContentToolbar({
  left,
  right,
  className,
}: ContentToolbarProps) {
  return (
    <div
      data-slot="content-toolbar"
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1">{left}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1">{right}</div>
    </div>
  )
}
