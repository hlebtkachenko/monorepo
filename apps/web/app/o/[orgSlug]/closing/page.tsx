import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { listFavorites } from "@/lib/org/favorite-actions"

import { FavoritesOverview } from "../_shell/app-body/app-content/content-body/favorites-overview"

/**
 * Closing module → Overview.
 *
 * The Closing module home. An Overview is a module home, so it carries NO
 * favorite star (a star would pin the overview onto its own favorites list). Its
 * body renders the Closing module's favorited pages as cards (REAL favorites,
 * read under `withOrgReadonly`) or an empty state — no demo content. The title
 * comes from the shell's nav-derived header fallback.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("closing") }
}

export default async function ClosingOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const favorites = await listFavorites({ slug: orgSlug, module: "closing" })

  return <FavoritesOverview slug={orgSlug} favorites={favorites} />
}
