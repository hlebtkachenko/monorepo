import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { setCurrencyEnabled } from "@/lib/org/currency-actions"
import { getCurrencyRegister } from "@/lib/org/currency-data"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { CurrenciesView } from "../../../_shell/app-body/app-content/content-body/currencies-view"

/**
 * Finance → Číselníky → Měny.
 *
 * The ISO 4217 currency reference surface: a Table archetype over the shared
 * `currency` catalog, each row flagged with whether this org has enabled it
 * (`org_currency`) and whether it is a functional / accounting currency (from
 * `accounting_period.accounting_currency`). Enable / disable writes an
 * `org_currency` row via `setCurrencyEnabled`; the functional currency needs no
 * toggle — it is always available regardless. Display names come from the DB
 * (`currency.name`); the 5-row catalog is fixed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("currencies") }
}

/** Row status precedence: functional wins (always available), then enabled. */
function statusOf(entry: { enabled: boolean; functional: boolean }): string {
  return entry.functional
    ? "functional"
    : entry.enabled
      ? "enabled"
      : "disabled"
}

export default async function CurrenciesPage({
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
  const title = t("currencies")
  const route = "finance/ciselniky/meny"

  const [currencies, active] = await Promise.all([
    getCurrencyRegister({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = currencies.map((c) => ({
    id: c.code,
    code: c.code,
    name: c.name,
    status: statusOf(c),
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

  async function onSetEnabled(code: string, enabled: boolean) {
    "use server"
    const result = await setCurrencyEnabled({ slug: orgSlug, code, enabled })
    if (!result.ok) throw new Error("currency toggle failed")
    return result.enabled ?? false
  }

  return (
    <CurrenciesView
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
      onSetEnabled={onSetEnabled}
    />
  )
}
