import { listFavorites } from "@/lib/org/favorite-actions"

import { FavoritesOverview } from "./_shell/app-body/app-content/content-body/favorites-overview"

/**
 * Company home for the rebuilt tree — the Company module's Overview.
 *
 * Renders the current user's favorited Company-module pages as cards (read
 * server-side under `withOrgReadonly`), or an i18n empty state when there are
 * none. No demo content: the cards are REAL favorites the user starred via the
 * content-header star, never mock rows.
 */
export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const favorites = await listFavorites({ slug: orgSlug, module: "company" })
  return <FavoritesOverview slug={orgSlug} favorites={favorites} />
}
