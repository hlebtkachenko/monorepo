"use client"

import type { ReactNode } from "react"

import { DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

/**
 * Gap between a header dropdown and its trigger — the same 8px the shell
 * uses for its page-edge insets, so menus sit on the same spacing grid.
 */
export const MENU_GAP = 8

/**
 * Shared sizing for the header dropdowns: 14px text (--menu-text-size),
 * 16px icons (default), 8px gap, 6×8px item padding (→32px rows), 8px
 * container padding, full-bleed 8px-margin dividers. Width sizes to content
 * above the --menu-min-width floor (no magic px), overriding the primitive's
 * default trigger-width sizing.
 *
 * Single source for every app-chrome header menu (profile, help, org +
 * period switchers) — keep menu chrome from drifting per surface.
 */
export const HEADER_MENU =
  "w-auto min-w-[var(--menu-min-width)] p-2 [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:px-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:text-[length:var(--menu-text-size)] [&_[data-slot=dropdown-menu-sub-trigger]]:gap-2 [&_[data-slot=dropdown-menu-sub-trigger]]:px-2 [&_[data-slot=dropdown-menu-sub-trigger]]:py-1.5 [&_[data-slot=dropdown-menu-sub-trigger]]:text-[length:var(--menu-text-size)] [&_[data-slot=dropdown-menu-separator]]:-mx-2 [&_[data-slot=dropdown-menu-separator]]:my-2"

/**
 * Shared base for the header context-switcher triggers (org + period). Same
 * 32px box, idle/hover/selected treatment, and text color as the right-side
 * action IconButtons (`text-icon-active` idle, `bg-icon-hover-bg` hover,
 * `bg-icon-active-bg` while the menu is open via `aria-expanded`) — so the
 * switchers read as the same chrome. Append text size + max-width per switcher.
 */
export const HEADER_SWITCHER_TRIGGER =
  "flex h-8 items-center gap-1.5 rounded-sm px-2 font-medium text-icon-active outline-none transition-[background-color] hover:bg-icon-hover-bg aria-expanded:bg-icon-active-bg focus-visible:ring-2 focus-visible:ring-ring/50"

/** First initials of the first + last name word, uppercased. */
export function initialsOf(name: string | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return (first + last).toUpperCase() || "?"
}

/**
 * Wraps a dropdown trigger in a bottom tooltip. IconButton's built-in
 * tooltip can't be used here (it returns a Provider tree, which can't also
 * be a DropdownMenuTrigger asChild target), so the tooltip is composed
 * around the trigger once, here, instead of inline per menu.
 *
 * Only needed for icon-only triggers (Inbox, Help, Profile avatar) — a
 * trigger that already shows a text label (org / period switcher) doesn't
 * use this.
 */
export function HeaderMenuTrigger({
  tooltip,
  children,
}: {
  tooltip: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
