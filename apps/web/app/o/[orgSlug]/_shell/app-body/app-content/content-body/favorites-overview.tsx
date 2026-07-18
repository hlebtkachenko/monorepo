import Link from "next/link"

import { getTranslations } from "@workspace/i18n/server"
import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card"

import { orgHref } from "@/lib/org/href"
import type { FavoritePageRow } from "@/lib/org/favorite-actions"

/**
 * A module's Overview body: cards for the current user's favorited pages of that
 * module (already read via `listFavorites` under `withOrgReadonly`). Each card
 * links to its page's org-relative route through `orgHref`. Renders an i18n
 * empty state when there are no favorites — REAL data only, never demo rows.
 */
export async function FavoritesOverview({
  slug,
  favorites,
}: {
  slug: string
  favorites: FavoritePageRow[]
}) {
  const t = await getTranslations("org.favorites")

  if (favorites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {t("heading")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map((favorite) => (
          <Link
            key={favorite.id}
            href={orgHref(slug, favorite.route)}
            className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Card className="transition-colors group-hover:ring-primary/30">
              <CardHeader>
                <CardTitle className="truncate text-sm">
                  {favorite.label}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
