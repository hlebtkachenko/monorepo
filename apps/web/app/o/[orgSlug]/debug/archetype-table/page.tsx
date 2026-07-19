import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getHeaderPeriods } from "@/lib/org/header-periods"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { DebugArchetypeTableView } from "../../_shell/app-body/app-content/content-body/debug-archetype-table-view"
import { hasDebugModuleAccess } from "../access"

/**
 * Debug module → Archetype Table.
 *
 * A reference page proving the Table archetype + Table Body wire cleanly in the
 * new org tree under the section-library governance. Same dev/admin-only gate as
 * the Debug overview: renders ONLY on a development build OR for a member of an
 * allowlisted workspace, else fails closed to a 404.
 *
 * The rows are REAL (the org's accounting periods, read under `withAdminBypass`
 * with an explicit org filter — no fixtures, per the tree charter). This server
 * component owns the fetch AND the DB→row projection (the single serialization
 * boundary); the interactive `ArchetypeTable` lives in the client view it hands
 * the plain rows to.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("archetypeTable") }
}

export default async function DebugArchetypeTablePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const session = await getRequestSession()
  const membership = session
    ? await resolveMembership({ slug: orgSlug, userId: session.user.id })
    : null
  if (!membership || !(await hasDebugModuleAccess(membership.workspaceId))) {
    notFound()
  }

  const t = await getTranslations("org.titles")
  const periods = await getHeaderPeriods({
    organizationId: membership.organizationId,
  })
  const rows: readonly TableSectionRow[] = periods.map((period) => ({
    id: period.id,
    start: period.period_start,
    end: period.period_end,
    status: period.status,
  }))

  return (
    <DebugArchetypeTableView
      slug={orgSlug}
      title={t("archetypeTable")}
      rows={rows}
    />
  )
}
