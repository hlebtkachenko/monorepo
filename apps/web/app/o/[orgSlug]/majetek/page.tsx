import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { listFavorites } from "@/lib/org/favorite-actions"

import { FavoritesOverview } from "../_shell/app-body/app-content/content-body/favorites-overview"

/**
 * Assets (Majetek) module → Overview.
 *
 * The Assets (fixed-assets) module home. An Overview is a module home, so it
 * carries NO favorite star. Its body renders the module's favorited pages as
 * cards (REAL favorites, read under `withOrgReadonly`) or an empty state — no
 * demo content. The title comes from the shell's nav-derived header fallback.
 * The register / operations / settings pages arrive one at a time in later
 * slices of the Assets campaign (EPIC #922).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("assets") }
}

export default async function AssetsOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const favorites = await listFavorites({ slug: orgSlug, module: "assets" })

  return <FavoritesOverview slug={orgSlug} favorites={favorites} />
}
