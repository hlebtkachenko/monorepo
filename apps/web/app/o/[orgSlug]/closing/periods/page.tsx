import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"
import { ArchetypeBlank } from "@workspace/ui/blocks/archetypes"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"

/**
 * Closing module → Periods.
 *
 * No Periods body is designed yet, and this tree allows NO demo / placeholder
 * content, so the page renders the Blank archetype: a title plus a single
 * full-height empty section (the charter-sanctioned "no content yet" body).
 * Its favorite star is threaded through the archetype's `favorite` prop —
 * starring it pins Periods onto the Closing Overview (`module_key='closing'`).
 * The optimism lives in the archetype (`useOptimisticFavorite`); this page
 * supplies only the seed state + a bound server action.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("periods") }
}

export default async function ClosingPeriodsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const te = await getTranslations("org.empty")
  const title = t("periods")
  const active = await isFavorited({ slug: orgSlug, route: "closing/periods" })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: "closing/periods",
      module: "closing",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <ArchetypeBlank
      title={title}
      emptyTitle={te("title")}
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
