import { notFound } from "next/navigation"

import { PeriodsView } from "../_components/periods-view"
import { getSettingsPageContext, loadPeriods } from "../_lib/settings-data"

export const metadata = { title: "Periods & fiscal year" }

/**
 * Periods & fiscal year — lists the účetní období rows and rolls the latest
 * OPEN period forward (close + open next). Read/write inside `withOrganization`
 * (FORCE RLS); the roll-forward write gates on owner/admin in the action.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const periods = await loadPeriods(page.ctx, page.userId)
  return <PeriodsView slug={orgSlug} periods={periods} canEdit={page.canEdit} />
}
