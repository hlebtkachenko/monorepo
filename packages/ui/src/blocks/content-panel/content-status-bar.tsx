import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface ContentStatusBarProps {
  /**
   * Left cluster — aggregate info about ALL content (totals, sums, counts,
   * validation summary). NOT about the current selection (that's the
   * ActionBar) and NOT pagination (that's the table footer).
   */
  left?: React.ReactNode
  /** Right cluster — occasional helper actions (export, refresh, …). */
  right?: React.ReactNode
  className?: string
}

/**
 * The content panel's status bar — an optional 24px band pinned to the bottom,
 * same chrome as the toolbar but with the hairline border on TOP. Mount it
 * only when there's aggregate info worth showing (e.g. a table's totals);
 * renders nothing when both slots are empty.
 */
export function ContentStatusBar({
  left,
  right,
  className,
}: ContentStatusBarProps) {
  if (left == null && right == null) return null
  return (
    <div
      data-slot="content-status-bar"
      className={cn(
        "flex h-6 shrink-0 items-center gap-2 border-t border-border-subtle px-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      {right != null ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {right}
        </div>
      ) : null}
    </div>
  )
}
