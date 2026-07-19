import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getDebugNormalTableRows } from "@/lib/org/debug-demo"

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
  const records = await getDebugNormalTableRows({
    organizationId: membership.organizationId,
    userId: session.user.id,
  })
  const rows: readonly TableSectionRow[] = records.map((record) => ({
    id: record.id,
    document: record.document,
    partner: record.partner,
    status: record.status,
    amount: record.amount,
    issuedOn: record.issuedOn,
    note: record.note,
  }))

  return (
    <DebugNormalTableView slug={orgSlug} title={t("normalTable")} rows={rows} />
  )
}
