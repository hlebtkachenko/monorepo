"use client"

import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Controlled favorite/star state for the content header. The header is
 * presentational — it owns NO state: the caller passes the current `active`
 * flag plus an `onToggle` that flips the persisted (server) state. The label
 * fields are optional so this app-agnostic UI package renders standalone
 * (Storybook, unwired consumers) with English defaults, while an app inside an
 * i18n context passes translated strings.
 */
export interface ContentHeaderFavorite {
  /** Whether the current page is favorited. Fully controlled by the caller. */
  active: boolean
  /** Fired on click — the caller flips the persisted favorite. */
  onToggle: () => void
  /** Hover tooltip text. Defaults to "Favorite". */
  tooltip?: string
  /** `aria-label` while inactive. Defaults to "Add to favorites". */
  addLabel?: string
  /** `aria-label` while active. Defaults to "Remove from favorites". */
  removeLabel?: string
}

/** Controlled favorite/star toggle for the current page. */
function FavoriteButton({
  active,
  onToggle,
  tooltip = "Favorite",
  addLabel = "Add to favorites",
  removeLabel = "Remove from favorites",
}: ContentHeaderFavorite) {
  return (
    <IconButton
      icon="Star"
      aria-label={active ? removeLabel : addLabel}
      aria-pressed={active}
      tooltip={tooltip}
      tooltipSide="bottom"
      onClick={onToggle}
      className={cn(active && "text-primary [&_svg]:fill-current")}
    />
  )
}

/**
 * The content-header's right-aligned action cluster — a CLOSED set `{Favorite}`.
 * There is no page-injection slot: the header is general chrome, not page
 * content. A new global action is added here (for all pages), never per-page.
 * The assistant toggle sits to the right of this cluster and is owned by the
 * shell.
 *
 * The favorite star is FULLY controlled by the optional `favorite` prop (no
 * local state): it renders only when a page wires a real toggle, so an unwired
 * header shows no dead star. Passing `favorite` renders the controlled star.
 */
export function ContentHeaderActions({
  favorite,
}: {
  favorite?: ContentHeaderFavorite
}) {
  if (!favorite) return null
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <FavoriteButton {...favorite} />
    </div>
  )
}
