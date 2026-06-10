"use client"

import type { ReactNode } from "react"

import { Input } from "@workspace/ui/components/input"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export interface AppHeaderProps {
  /** Placeholder for the centered search input. */
  searchPlaceholder?: string
  /**
   * Right-zone action cluster, composed per surface (org, admin, …) from
   * the shared primitives (IconButton, DropdownMenu, …). The block owns
   * only the layout + the screen-centered search; surfaces own their
   * actions — same data-in approach as AppRail, but a slot because header
   * actions are heterogeneous (buttons, dropdowns, a toggle, an avatar).
   */
  actions?: ReactNode
  className?: string
}

/**
 * App-shell header bar — fills the AppShell `header` slot. Two zones:
 *   - center: a search input centered to the SCREEN (offset `50vw` by the
 *     rail width so it stays centered as the rail collapses)
 *   - right:  the `actions` slot
 *
 * Below `md` the screen-centered absolute layout collides with the
 * actions cluster, so both zones become a plain flex row instead:
 * search fills the remaining space (shrinking as needed), actions sit
 * flush right — no overlap at any width. Desktop keeps the exact
 * absolute geometry (the `md:` classes reproduce the previous inline
 * styles verbatim).
 *
 * Presentational only — no product content lives here.
 */
export function AppHeader({
  searchPlaceholder = "Search…",
  actions,
  className,
}: AppHeaderProps) {
  const SearchIcon = useIcons().Search
  return (
    <div
      data-slot="app-header"
      className={cn(
        "relative flex size-full items-center max-md:gap-2 max-md:px-2",
        className,
      )}
    >
      <div className="relative min-w-0 flex-1 md:absolute md:top-1/2 md:left-[calc(50vw-var(--shell-rail-width))] md:w-[clamp(var(--header-search-min),calc(100vw-var(--header-search-gutter)),var(--header-search-max))] md:flex-none md:-translate-x-1/2 md:-translate-y-1/2">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon" />
        <Input
          type="search"
          aria-label="Search"
          placeholder={searchPlaceholder}
          className="h-7 pl-8 max-md:h-9"
        />
      </div>

      <div
        data-slot="app-header-actions"
        className="flex shrink-0 items-center gap-2 max-md:ml-auto md:absolute md:top-1/2 md:right-2 md:-translate-y-1/2"
      >
        {actions}
      </div>
    </div>
  )
}
