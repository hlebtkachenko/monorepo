"use client"

import * as React from "react"

import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

/** Local favorite/star toggle. */
function FavoriteButton() {
  const [favorite, setFavorite] = React.useState(false)
  return (
    <IconButton
      icon="Star"
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      tooltip="Favorite"
      tooltipSide="bottom"
      onClick={() => setFavorite((f) => !f)}
      className={cn(favorite && "text-primary [&_svg]:fill-current")}
    />
  )
}

/** Config / settings button. */
function ConfigButton() {
  return (
    <IconButton
      icon="Settings2"
      aria-label="Configure"
      tooltip="Configure"
      tooltipSide="bottom"
    />
  )
}

/**
 * The content-header's right-aligned action cluster — a CLOSED set
 * `{Favorite, Configure}`, rendered for EVERY page. There is no page-injection
 * slot: the header is general chrome, not page content. A new global action is
 * added here (for all pages), never per-page. The assistant toggle sits to the
 * right of this cluster and is owned by the shell.
 */
export function ContentHeaderActions() {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <FavoriteButton />
      <ConfigButton />
    </div>
  )
}
