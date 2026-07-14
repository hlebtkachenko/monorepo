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
 * ContentHeaderTitle — the current page's (sub)title, the ONE selected item in
 * the left cluster: `font-medium`, and the REVERSE hover of the muted items —
 * foreground (black) when idle, muted (grey) on hover. Truncates under pressure.
 * The optional `titleIcon` is decorative (sidebar-matched width); the header is
 * closed chrome, not a control.
 */
export function ContentHeaderTitle({
  title,
  titleIcon,
}: ContentHeaderTitleProps) {
  const icons = useIcons()
  const Icon = titleIcon ? icons[titleIcon] : null
  return (
    <div className="flex min-w-0 shrink items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground">
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span className="truncate">{title}</span>
    </div>
  )
}
