import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getDebugNormalTableRows } from "@/lib/org/debug-demo"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"

import { DebugNormalTableView } from "../../../_shell/app-body/app-content/content-body/debug-normal-table-view"
import { requireDebugAccess } from "../../access"

/**
 * Debug → Archetype Table → Normal Table.
 *
 * Reference page for the Table archetype + the Normal Table Body + the row
 * Inspector, wired from the packages/ui blocks. Same dev/allowlist gate as the
 * Debug overview (fail-closed to 404). Rows are REAL (queried from the
 * dev-seeded `demo_debug_normal_table_record`, empty in prod) — projected once
 * here, the serialization boundary, then handed to the client view.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("normalTable") }
}

export default async function DebugNormalTablePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const { session, membership } = await requireDebugAccess(orgSlug)

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const title = t("normalTable")
  const route = "debug/archetype-table/normal-table"

  const [records, active] = await Promise.all([
    getDebugNormalTableRows({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])
  const rows: readonly TableSectionRow[] = records.map((record) => ({
    id: record.id,
    document: record.document,
    partner: record.partner,
    status: record.status,
    amount: record.amount,
    issuedOn: record.issuedOn,
    note: record.note,
  }))

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
    <DebugNormalTableView
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
