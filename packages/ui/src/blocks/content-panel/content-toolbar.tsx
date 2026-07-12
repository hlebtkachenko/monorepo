import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface ContentToolbarProps {
  /**
   * Left cluster — the content-transforming controls that can grow: status,
   * search, and the filter bar. Wraps onto extra rows when it overflows, which
   * grows the toolbar's height (the right cluster stays pinned top-right).
   */
  left?: React.ReactNode
  /** Right cluster — fixed page actions (view, sort, add). Never wraps. */
  right?: React.ReactNode
  className?: string
}

/**
 * The content panel's toolbar — controls that transform the body (filter,
 * search, sort, view, add). One row tall by default (36px, same chrome as the
 * header: full width, side padding, hairline bottom border) but it GROWS: the
 * left cluster wraps onto extra rows when the filters don't fit, and the
 * toolbar gets taller to hold them. The right cluster stays pinned top-right.
 *
 * Put only body-transforming controls here. Row/selection actions belong in the
 * floating ActionBar; element detail belongs in the Inspector.
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
        "flex min-h-9 shrink-0 items-start gap-2 border-b border-border-subtle px-2 py-1",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {left}
      </div>
      <div className="flex shrink-0 items-center gap-1 py-px">{right}</div>
    </div>
  )
}
