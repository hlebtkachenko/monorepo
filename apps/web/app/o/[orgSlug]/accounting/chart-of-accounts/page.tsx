import type { Metadata } from "next"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import {
  getChartAccounts,
  getChartTemplates,
  startChartFromFramework,
  startChartFromTemplate,
  updateChartAccount,
} from "@/lib/org/accounting"
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
 * Class → Group → Synthetic → Analytical tree the Tree-table renders. Three states:
 * no active period (message), an empty chart (message + the two seed actions), and
 * the populated tree. All writes (seed / edit) are human-gated and flow through the
 * server actions defined here — the account domain is edited through the row
 * Inspector, seeded through the toolbar.
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

  // An empty chart on an active period is seedable. Templates power the picker.
  const year = active ? Number(active.period_start.slice(0, 4)) : null
  const canSeed = active != null && accounts.length === 0
  const templates =
    canSeed && year != null
      ? (
          await getChartTemplates(
            membership.organizationId,
            session.user.id,
            year,
          )
        ).map((t) => ({ id: t.id, label: t.name, isDefault: t.isDefault }))
      : []

  const chartRoute = "accounting/chart-of-accounts"
  const chartPath = `/o/${orgSlug}/${chartRoute}`

  const activeFavorite = await isFavorited({ slug: orgSlug, route: chartRoute })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route: chartRoute,
      module: "accounting",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  async function onSeedFromFramework() {
    "use server"
    if (!active) return
    await startChartFromFramework(
      membership!.organizationId,
      membership!.workspaceId,
      session!.user.id,
      active.id,
      Number(active.period_start.slice(0, 4)),
    )
    revalidatePath(chartPath)
  }

  async function onSeedFromTemplate(templateId: string) {
    "use server"
    if (!active) return
    await startChartFromTemplate(
      membership!.organizationId,
      membership!.workspaceId,
      session!.user.id,
      active.id,
      templateId,
    )
    revalidatePath(chartPath)
  }

  async function onUpdateAccount(input: {
    id: string
    name?: string
    tracksOpenItems?: boolean
    taxRelevant?: boolean | null
  }) {
    "use server"
    await updateChartAccount(
      membership!.organizationId,
      membership!.workspaceId,
      session!.user.id,
      input,
    )
    revalidatePath(chartPath)
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
      canSeed={canSeed}
      templates={templates}
      onSeedFromFramework={onSeedFromFramework}
      onSeedFromTemplate={onSeedFromTemplate}
      onUpdateAccount={onUpdateAccount}
    />
  )
}
