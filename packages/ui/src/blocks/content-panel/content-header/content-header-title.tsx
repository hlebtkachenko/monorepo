"use client"

import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"

export interface ContentHeaderTitleProps {
  /** The active Page/Subpage name. A scalar string — never a node. */
  title: string
  /** Optional decorative leading icon (a closed icon name, never a node). */
  titleIcon?: IconName
}

/**
 * ContentHeaderTitle — the page title shown left of the view-tabs separator.
 * Truncates. The optional `titleIcon` is decorative only (a name from the
 * closed `IconName` union, resolved via `useIcons()`); it is not a back-button
 * or any interactive control — the header is closed chrome.
 */
export function ContentHeaderTitle({
  title,
  titleIcon,
}: ContentHeaderTitleProps) {
  const icons = useIcons()
  const Icon = titleIcon ? icons[titleIcon] : null
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate text-sm font-semibold text-foreground">
        {title}
      </span>
    </div>
  )
}
