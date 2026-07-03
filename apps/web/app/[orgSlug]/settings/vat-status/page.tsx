import { notFound } from "next/navigation"

import { VatStatusView } from "../_components/vat-status-view"
import { getSettingsPageContext, loadVatStatus } from "../_lib/settings-data"

export const metadata = { title: "VAT status" }

/**
 * VAT status — the vat_status history, OSS registrations, and the tax
 * representative. Reads inside `withOrganization` (FORCE RLS); each change is a
 * gated (owner/admin) server action. Changing the status closes the open row
 * and inserts the new one via the accounting `createVatStatus` helper.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const data = await loadVatStatus(page.ctx, page.userId)
  return <VatStatusView slug={orgSlug} data={data} canEdit={page.canEdit} />
}
