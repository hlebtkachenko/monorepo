import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"

import { DebugTreeTableView } from "../../../_shell/app-body/app-content/content-body/debug-tree-table-view"
import { requireDebugAccess } from "../../access"

/**
 * Debug → Archetype Table → Tree Table.
 *
 * Reference page for the Tree-table Body section (the flat Table's editable grid
 * plus a Class → Group → Synthetic → Analytical expand/collapse hierarchy), wired
 * from the packages/ui blocks. Same dev/allowlist gate as the Debug overview
 * (fail-closed to 404). The demo tree is a static in-code sample owned by the
 * client view — this is a dev-only reference, so there is no seeded table.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("treeTable") }
}

export default async function DebugTreeTablePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  await requireDebugAccess(orgSlug)

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const title = t("treeTable")
  const route = "debug/archetype-table/tree-table"

  const active = await isFavorited({ slug: orgSlug, route })

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
    <DebugTreeTableView
      key={orgSlug}
      slug={orgSlug}
      title={title}
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
