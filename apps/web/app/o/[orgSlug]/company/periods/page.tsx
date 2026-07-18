import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { isFavorited } from "@/lib/org/favorite-actions"

import { FavoritePageHeader } from "../../_components/favorite-page-header"

/**
 * Company module → Periods.
 *
 * No Periods body is designed yet — and this tree allows NO demo / placeholder
 * content, so the body stays empty. The page's one real surface is the favorite
 * star in its content header: starring it pins Periods onto the Company Overview
 * (`module_key='company'`). Real content lands in the execution phase.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("periods") }
}

export default async function CompanyPeriodsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const t = await getTranslations("org.titles")
  const active = await isFavorited({ slug: orgSlug, route: "company/periods" })

  return (
    <FavoritePageHeader
      slug={orgSlug}
      title={t("periods")}
      route="company/periods"
      module="company"
      initialActive={active}
    />
  )
}
