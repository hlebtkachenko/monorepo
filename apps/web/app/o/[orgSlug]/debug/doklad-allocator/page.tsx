import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { getDocumentTypes } from "@/lib/org/document-types"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getActivePeriod } from "@/lib/org/period"

import { DokladAllocatorView } from "../../_shell/app-body/app-content/content-body/doklad-allocator-view"
import type { AllocatorType } from "../../_shell/app-body/app-content/content-body/doklad-allocator-view"
import { requireDebugAccess } from "../access"

/**
 * Debug → Doklad allocator.
 *
 * Proves the typ→řada→číslo chain end to end: lists the org's active doklad types
 * that have a default číselná řada, and lets the operator allocate that série's
 * next gapless Označení in the active účetní období. Same fail-closed dev/allowlist
 * gate as the rest of the Debug module. Real data + a real allocation (advances the
 * counter) — behind the Debug gate, never a production user surface.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("dokladAllocator") }
}

export default async function DokladAllocatorPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const { session, membership } = await requireDebugAccess(orgSlug)

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const title = t("dokladAllocator")
  const route = "debug/doklad-allocator"

  const [documentTypes, period, active] = await Promise.all([
    getDocumentTypes(membership.organizationId, session.user.id),
    getActivePeriod(membership.organizationId, session.user.id),
    isFavorited({ slug: orgSlug, route }),
  ])

  // Only active types wired to a default DOCUMENT série can allocate.
  const types: AllocatorType[] = documentTypes
    .filter((type) => type.isActive && type.defaultSeriesCode !== null)
    .map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      seriesCode: type.defaultSeriesCode as string,
    }))

  const periodLabel = period.active
    ? (period.active.zkratka ?? period.active.period_end.slice(0, 4))
    : null

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "debug",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <DokladAllocatorView
      key={orgSlug}
      slug={orgSlug}
      title={title}
      types={types}
      periodLabel={periodLabel}
      favorite={{
        initialActive: active,
        onToggle: onToggleFavorite,
        tooltip: tf("tooltip"),
        addLabel: tf("add"),
        removeLabel: tf("remove"),
      }}
    />
  )
}
