import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getFramework } from "@/lib/org/accounting"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getActivePeriod } from "@/lib/org/period"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { ChartFrameworkView } from "../../_shell/app-body/app-content/content-body/chart-framework-view"

/**
 * Účetnictví → Účetní osnova (statutory year framework).
 *
 * Read-only reference: the směrná osnova (synthetic-only) for the active period's
 * year, resolved via `getFramework` (osnovaNames-localized). No hierarchy — a flat
 * table. Year is taken from the active period's start; when there is no active
 * period the page shows a message. Purely read, no write path.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("chartFramework") }
}

export default async function ChartFrameworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { orgSlug } = await params
  const { period } = await searchParams

  const [tt, tp, tf] = await Promise.all([
    getTranslations("org.titles"),
    getTranslations("accounting.chartOfAccounts.framework"),
    getTranslations("org.favorite"),
  ])
  const title = tt("chartFramework")

  const session = await getRequestSession()
  if (!session) redirect("/auth/login")
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) redirect("/workspace?error=no-access")

  const { active } = await getActivePeriod(
    membership.organizationId,
    session.user.id,
    period,
  )

  // The framework is keyed by calendar year; take it from the active period's
  // start (a "YYYY-MM-DD" string — slice avoids any timezone shift).
  const year = active ? Number(active.period_start.slice(0, 4)) : null
  const framework =
    year != null
      ? await getFramework(membership.organizationId, session.user.id, year)
      : []

  const rows: TableSectionRow[] = framework.map((r) => ({
    code: r.code,
    name: r.name,
    statementClass: r.statementClass,
    accountType: r.accountType,
    normalBalance: r.normalBalance,
    tracksOpenItems: r.tracksOpenItems ? "yes" : "no",
    taxRelevant: r.taxRelevant == null ? null : r.taxRelevant ? "yes" : "no",
    balanceSheetLine: r.balanceSheetLine,
    incomeStatementLine: r.incomeStatementLine,
  }))

  const activeFavorite = await isFavorited({
    slug: orgSlug,
    route: "accounting/chart-framework",
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: "accounting/chart-framework",
      module: "accounting",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <ChartFrameworkView
      slug={orgSlug}
      title={title}
      favorite={{
        initialActive: activeFavorite,
        onToggle: onToggleFavorite,
        tooltip: tf("tooltip"),
        addLabel: tf("add"),
        removeLabel: tf("remove"),
      }}
      rows={rows}
      emptyText={tp("emptyNoPeriod")}
    />
  )
}
