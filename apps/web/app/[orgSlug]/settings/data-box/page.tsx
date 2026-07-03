import { notFound } from "next/navigation"

import { DataBoxForm } from "../_components/data-box-form"
import { getSettingsPageContext, loadDataBox } from "../_lib/settings-data"

export const metadata = { title: "Data box" }

/**
 * Data box — edit the ISDS datová schránka id (7-char lowercase alphanumeric).
 * Read/write inside `withOrganization` (FORCE RLS); the write gates on
 * owner/admin in the action and validates the format at the boundary.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const { dataBoxId } = await loadDataBox(page.ctx, page.userId)
  return (
    <DataBoxForm slug={orgSlug} dataBoxId={dataBoxId} canEdit={page.canEdit} />
  )
}
