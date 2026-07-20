import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getCountryRegister } from "@/lib/org/directory"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { StatyRegisterView } from "../../../_shell/app-body/app-content/content-body/adresar-staty-view"

/**
 * Adresář → Veřejné číselníky → Státy.
 *
 * The country reference register (ISO 3166-1), the first Directories public
 * číselník. Read-only Table archetype wired to the shared `country` reference
 * table via `listCountries` (@workspace/accounting) → the `getCountryRegister`
 * app-edge. Display names resolve from next-intl (`countryNames`, keyed by iso2),
 * so the row's `name` is localized here at the serialization boundary — the DB
 * stores no name. Empty in an org with no reference data (the seed is global, so
 * in practice always 258).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("states") }
}

export default async function StatyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // The layout already fail-closes on a missing session/membership; re-resolve
  // here for the org id the read needs (and as a belt for a direct hit).
  const session = await getRequestSession()
  if (!session) notFound()
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) notFound()

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const names = await getTranslations("countryNames")
  const title = t("states")
  const route = "adresar/ciselniky/staty"

  const [countries, active] = await Promise.all([
    getCountryRegister({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = countries.map((country) => {
    const key = country.iso2 as Parameters<typeof names>[0]
    return {
      id: country.iso2,
      code: country.iso2,
      name: names.has(key) ? names(key) : country.iso2,
      currency: country.currencyCode ?? "",
    }
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "directory",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <StatyRegisterView
      key={orgSlug}
      slug={orgSlug}
      title={title}
      rows={rows}
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
