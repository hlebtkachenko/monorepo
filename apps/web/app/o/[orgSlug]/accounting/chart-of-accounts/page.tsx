import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import { getChartAccounts } from "@/lib/org/accounting"
import { buildChartTree } from "@/lib/org/chart-of-accounts-tree"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getActivePeriod } from "@/lib/org/period"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { ChartOfAccountsView } from "../../_shell/app-body/app-content/content-body/chart-of-accounts-view"

/**
 * Účetnictví → Účtový rozvrh (chart of accounts).
 *
 * Server-resolves the org + the URL-driven active period (`?period=`), reads the
 * period's chart under org FORCE-RLS (`getChartAccounts`), and projects it into the
 * Class → Group → Synthetic → Analytical tree the read-only Tree-table renders. The
 * layout has already gated access; the membership re-resolve only recovers the ids
 * the RSC tree can't pass down. Three states: no active period, an empty chart, and
 * the populated tree — the first two are messages (seeding lives in the human-gated
 * write batch, so there is no button here, per the o-tree "no placeholder" charter).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("chartOfAccounts") }
}

export default async function ChartOfAccountsPage({
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
    getTranslations("accounting.chartOfAccounts.page"),
    getTranslations("org.favorite"),
  ])
  const title = tt("chartOfAccounts")

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

  const accounts = active
    ? await getChartAccounts(
        membership.organizationId,
        session.user.id,
        active.id,
      )
    : []

  const tcn = await getTranslations("accounting.chartOfAccounts.classNames")
  const tree = buildChartTree(accounts, (cls) =>
    tcn(String(cls) as Parameters<typeof tcn>[0]),
  )
  const emptyText = active ? tp("emptyNoChart") : tp("emptyNoPeriod")

  const activeFavorite = await isFavorited({
    slug: orgSlug,
    route: "accounting/chart-of-accounts",
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: "accounting/chart-of-accounts",
      module: "accounting",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <ChartOfAccountsView
      slug={orgSlug}
      title={title}
      favorite={{
        initialActive: activeFavorite,
        onToggle: onToggleFavorite,
        tooltip: tf("tooltip"),
        addLabel: tf("add"),
        removeLabel: tf("remove"),
      }}
      tree={tree}
      emptyText={emptyText}
    />
  )
}
