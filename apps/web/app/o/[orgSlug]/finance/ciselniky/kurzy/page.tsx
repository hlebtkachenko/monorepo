import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getFxRateRegister } from "@/lib/org/fx-rate-data"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { FxRatesView } from "../../../_shell/app-body/app-content/content-body/fx-rates-view"

/**
 * Finance → Číselníky → Kurzy.
 *
 * The FX-rate reference surface: a read-only Table archetype over the shared
 * `fx_rate` store (ČNB daily fixes). Rows are shown VERBATIM — raw kurz (`rate`)
 * + množství (`unitAmount`) — so the auditable stored values are visible; the
 * per-unit division is the resolver's job, never presentation. Empty until the
 * ČNB ingest has run (the `cnb-fx-daily` lane, or the Import action in a later
 * slice). The manual override + ČNB-import writes land with the FX-wiring PR.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("rates") }
}

export default async function FxRatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const session = await getRequestSession()
  if (!session) notFound()
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) notFound()

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const title = t("rates")
  const route = "finance/ciselniky/kurzy"

  const [rates, active] = await Promise.all([
    getFxRateRegister({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = rates.map((r) => ({
    id: `${r.fromCode}-${r.toCode}-${r.rateDate}-${r.rateKind}-${r.source}`,
    pair: `${r.fromCode}/${r.toCode}`,
    date: r.rateDate,
    kind: r.rateKind,
    unit: r.unitAmount,
    rate: r.rate,
    source: r.source,
  }))

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "finance",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <FxRatesView
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
