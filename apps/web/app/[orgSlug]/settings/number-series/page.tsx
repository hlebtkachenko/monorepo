import { notFound } from "next/navigation"

import { NumberSeriesView } from "../_components/number-series-view"
import { getSettingsPageContext, loadNumberSeries } from "../_lib/settings-data"

export const metadata = { title: "Number series" }

/**
 * Number series — the number_series list (read-only) plus a conservative
 * "restore default series" backfill. Gapless numbering is legally sensitive,
 * so this page never offers inline edit/delete of an existing series.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const rows = await loadNumberSeries(page.ctx, page.userId)
  return <NumberSeriesView slug={orgSlug} rows={rows} canEdit={page.canEdit} />
}
