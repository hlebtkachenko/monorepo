"use client"

import * as React from "react"

import { useTranslations } from "@workspace/i18n/client"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { toggleFavorite } from "@/lib/org/favorite-actions"

/**
 * Portals a page's `ContentHeader` (title + a wired favorite star) into the
 * shell header. Shared by every `/o` page that wants a favorite toggle.
 *
 * The star is optimistic: the click flips the visible state inside a
 * transition and calls the `toggleFavorite` server action; a failed write
 * reverts to the confirmed state. Tenancy is derived server-side by the action
 * from the session + `slug` — the client never sends ids.
 *
 * `route` is the org-relative `orgHref` path (NEVER a full URL — it survives the
 * `/o` flip), `module` the page's rail module key, and `title` the label
 * snapshot stored on the favorite.
 */
export function FavoritePageHeader({
  slug,
  title,
  route,
  module: moduleKey,
  initialActive,
}: {
  slug: string
  title: string
  route: string
  module: string
  initialActive: boolean
}) {
  const t = useTranslations("org.favorite")
  const [active, setActive] = React.useState(initialActive)
  const [optimisticActive, addOptimistic] = React.useOptimistic(active)
  const [, startTransition] = React.useTransition()

  const onToggle = () => {
    const next = !optimisticActive
    startTransition(async () => {
      addOptimistic(next)
      const result = await toggleFavorite({
        slug,
        route,
        module: moduleKey,
        label: title,
      })
      // Commit the confirmed state; on failure `active` is unchanged, so the
      // optimistic value reverts to it when the transition settles.
      if (result.ok) setActive(result.favorited ?? next)
    })
  }

  return (
    <AppPageHeader>
      <ContentHeader
        title={title}
        favorite={{
          active: optimisticActive,
          onToggle,
          tooltip: t("tooltip"),
          addLabel: t("add"),
          removeLabel: t("remove"),
        }}
      />
    </AppPageHeader>
  )
}
