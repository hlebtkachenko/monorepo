import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { listPeriods } from "@/lib/org/period-data"

import { ClosingPeriodsView } from "../../_shell/app-body/app-content/content-body/closing-periods-view"

/**
 * Closing module → Účetní období (Periods).
 *
 * A read-only Table archetype over the org's REAL accounting periods, projected
 * server-side by `listPeriods` (one cached read, shared with the header
 * switcher). The `?period=` param threads into the active resolution so the
 * "Aktivní" row matches the switcher. The favorite star pins Periods onto the
 * Closing Overview (`module_key='closing'`). Open / close / edit actions arrive
 * in later slices; this slice is the read-only list.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("periods") }
}

export default async function ClosingPeriodsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ period?: string | string[] }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const requested = typeof sp.period === "string" ? sp.period : undefined

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const title = t("periods")
  const route = "closing/periods"

  const [periods, active] = await Promise.all([
    listPeriods({ slug: orgSlug, requestedPeriod: requested }),
    isFavorited({ slug: orgSlug, route }),
  ])

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "closing",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <ClosingPeriodsView
      key={orgSlug}
      slug={orgSlug}
      title={title}
      rows={periods}
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
