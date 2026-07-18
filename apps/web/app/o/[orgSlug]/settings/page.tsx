import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { isFavorited } from "@/lib/org/favorite-actions"

import { FavoritePageHeader } from "../_components/favorite-page-header"

/**
 * Settings landing for the rebuilt org tree.
 *
 * Resolves the profile menu's "Settings" link so it no longer 404s. No Settings
 * body is designed yet and this tree allows NO demo / placeholder content, so
 * the body stays empty. Its one real surface is the favorite star: starring it
 * pins Settings onto the Company Overview (`module_key='company'`, the org home
 * module the shell shows active here).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("settings") }
}

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const t = await getTranslations("org.titles")
  const active = await isFavorited({ slug: orgSlug, route: "settings" })

  return (
    <FavoritePageHeader
      slug={orgSlug}
      title={t("settings")}
      route="settings"
      module="company"
      initialActive={active}
    />
  )
}
