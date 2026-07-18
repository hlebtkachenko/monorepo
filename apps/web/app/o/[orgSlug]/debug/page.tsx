import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import { isFavorited, listFavorites } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { FavoritePageHeader } from "../_shell/app-body/app-content/content-header/favorite-page-header"
import { FavoritesOverview } from "../_shell/app-body/app-content/content-body/favorites-overview"
import { hasDebugModuleAccess } from "./access"

/**
 * Debug module → Overview.
 *
 * Dev/admin-only: the module is gated so it renders ONLY on a development build
 * OR for a member of an allowlisted workspace (see `./access`). A normal
 * production user who deep-links here fails closed to a 404 — the same decision
 * the rail uses to hide the module.
 *
 * Body carries no demo content: it renders the Debug module's favorited pages
 * as cards (REAL favorites, read under `withOrgReadonly`) or an empty state. The
 * content header carries a favorite star for this overview (`module_key='debug'`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("debug") }
}

export default async function DebugOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // The layout already guarantees a session + org membership; re-resolve here
  // only to read the workspace id the allowlist gate keys on, and fail closed.
  const session = await getRequestSession()
  const membership = session
    ? await resolveMembership({ slug: orgSlug, userId: session.user.id })
    : null
  if (!membership || !(await hasDebugModuleAccess(membership.workspaceId))) {
    notFound()
  }

  const t = await getTranslations("org.titles")
  const [active, favorites] = await Promise.all([
    isFavorited({ slug: orgSlug, route: "debug" }),
    listFavorites({ slug: orgSlug, module: "debug" }),
  ])

  return (
    <>
      <FavoritePageHeader
        slug={orgSlug}
        title={t("debug")}
        route="debug"
        module="debug"
        initialActive={active}
      />
      <FavoritesOverview slug={orgSlug} favorites={favorites} />
    </>
  )
}
