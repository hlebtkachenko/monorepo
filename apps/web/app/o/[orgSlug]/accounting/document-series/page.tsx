import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import {
  DOCUMENT_SERIES_CATEGORIES,
  getConfigurablePeriods,
  getDocumentSeriesList,
} from "@/lib/org/document-series"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { DocumentSeriesView } from "../../_shell/app-body/app-content/content-body/document-series-view"

/**
 * Účetnictví → Účetní nastavení → Dokladové řady.
 *
 * Server-resolves the org and reads its DOCUMENT číselné řady (with their
 * per-účetní-období numbering rows) + the org's accounting periods (for the grid's
 * add-row picker) under org FORCE-RLS. The 4 initial config categories are the
 * page's view tabs; a category with no séries renders an empty body. Not
 * period-scoped — a číselná řada is org config, perennial across účetní období.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("documentSeries") }
}

export default async function DocumentSeriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const [tt, tf] = await Promise.all([
    getTranslations("org.titles"),
    getTranslations("org.favorite"),
  ])
  const title = tt("documentSeries")

  const session = await getRequestSession()
  if (!session) redirect("/auth/login")
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) redirect("/workspace?error=no-access")

  const [series, periods] = await Promise.all([
    getDocumentSeriesList(membership.organizationId, session.user.id),
    getConfigurablePeriods(membership.organizationId, session.user.id),
  ])

  const activeFavorite = await isFavorited({
    slug: orgSlug,
    route: "accounting/document-series",
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: "accounting/document-series",
      module: "accounting",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <DocumentSeriesView
      slug={orgSlug}
      title={title}
      series={series}
      periods={periods}
      categories={[...DOCUMENT_SERIES_CATEGORIES]}
      favorite={{
        initialActive: activeFavorite,
        onToggle: onToggleFavorite,
        tooltip: tf("tooltip"),
        addLabel: tf("add"),
        removeLabel: tf("remove"),
      }}
    />
  )
}
