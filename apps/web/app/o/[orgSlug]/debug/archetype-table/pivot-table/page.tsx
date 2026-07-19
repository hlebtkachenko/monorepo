import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getDebugPivotTableRows } from "@/lib/org/debug-demo"

import { DebugPivotTableView } from "../../../_shell/app-body/app-content/content-body/debug-pivot-table-view"
import { requireDebugAccess } from "../../access"

/**
 * Debug → Archetype Table → Pivot Table.
 *
 * Reference page for the Table archetype hosting the Pivot Table Body, wired
 * from the packages/ui blocks. Same dev/allowlist gate (fail-closed to 404).
 * Rows are REAL (queried from the dev-seeded `demo_debug_pivot_table_record`,
 * empty in prod) — projected once here, then the client view pivots them
 * category × month → Σ amount.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("pivotTable") }
}

export default async function DebugPivotTablePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const { session, membership } = await requireDebugAccess(orgSlug)

  const t = await getTranslations("org.titles")
  const records = await getDebugPivotTableRows({
    organizationId: membership.organizationId,
    userId: session.user.id,
  })
  const rows: readonly TableSectionRow[] = records.map((record) => ({
    id: record.id,
    category: record.category,
    month: record.month,
    status: record.status,
    amount: record.amount,
  }))

  return (
    <DebugPivotTableView slug={orgSlug} title={t("pivotTable")} rows={rows} />
  )
}
