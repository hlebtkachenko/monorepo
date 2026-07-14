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

/**
 * The content-header's right-aligned action cluster — a CLOSED set `{Favorite}`,
 * rendered for EVERY page. There is no page-injection slot: the header is general
 * chrome, not page content. A new global action is added here (for all pages),
 * never per-page. The Configure button was removed. The assistant toggle sits to
 * the right of this cluster and is owned by the shell.
 *
 * Favorite is a local toggle today; wiring it to the followed-pages store (so a
 * user's starred pages surface in an overview, queried by where/what) is a
 * tracked follow-up.
 */
export function ContentHeaderActions() {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <FavoriteButton />
    </div>
  )
}
