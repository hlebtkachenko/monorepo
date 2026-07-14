"use client"

import { useIcons } from "@workspace/ui/icon-packs"

export interface ContentHeaderBackLinkData {
  /** Label of where "back" goes (e.g. "Issued invoices"). */
  label: string
  /** Navigation target for the back link. */
  href: string
}

/**
 * ContentHeaderBackLink — the leading `‹ Back to {label}` link. Used ONLY by the
 * Single archetype (a record opened from its source list). Non-selected styling
 * (identical to breadcrumb crumbs + inactive tabs). Responsive: when the header
 * narrows, the "to {label}" part drops so only `‹ Back` remains (container query
 * on the header, `/ch`).
 */
export function ContentHeaderBackLink({
  label,
  href,
}: ContentHeaderBackLinkData) {
  const icons = useIcons()
  const ChevronLeft = icons.ChevronLeft
  return (
    <a
      href={href}
      aria-label={`Back to ${label}`}
      className="flex shrink-0 items-center gap-1.5 text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4 shrink-0" />
      <span className="truncate">
        Back<span className="@max-[52rem]/ch:hidden"> to {label}</span>
      </span>
    </a>
  )
}
