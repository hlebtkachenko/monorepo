import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import {
  DOCUMENT_CATEGORIES,
  documentKindsByCategory,
  getDocumentSeriesOptions,
  getDocumentTypes,
} from "@/lib/org/document-types"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { DocumentTypesView } from "../../_shell/app-body/app-content/content-body/document-types-view"

/**
 * Účetnictví → Účetní nastavení → Typy dokladů.
 *
 * Server-resolves the org and reads its doklad types + DOCUMENT séries under
 * org FORCE-RLS. The 9 config categories are the page's view tabs; a category with
 * no types renders an empty body (types are created here, not seeded with a
 * placeholder). Not period-scoped — a doklad type is org config, perennial across
 * účetní období.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("documentTypes") }
}

export default async function DocumentTypesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const [tt, tf] = await Promise.all([
    getTranslations("org.titles"),
    getTranslations("org.favorite"),
  ])
  const title = tt("documentTypes")

  const session = await getRequestSession()
  if (!session) redirect("/auth/login")
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) redirect("/workspace?error=no-access")

  const [types, series] = await Promise.all([
    getDocumentTypes(membership.organizationId, session.user.id),
    getDocumentSeriesOptions(membership.organizationId, session.user.id),
  ])

  const activeFavorite = await isFavorited({
    slug: orgSlug,
    route: "accounting/document-types",
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: "accounting/document-types",
      module: "accounting",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <DocumentTypesView
      slug={orgSlug}
      title={title}
      types={types}
      series={series}
      categories={[...DOCUMENT_CATEGORIES]}
      kindsByCategory={documentKindsByCategory()}
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
