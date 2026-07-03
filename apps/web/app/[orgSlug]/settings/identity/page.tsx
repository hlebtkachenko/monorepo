import { notFound } from "next/navigation"

import { IdentityForm } from "../_components/identity-form"
import { getSettingsPageContext, loadOrgSettings } from "../_lib/settings-data"

export const metadata = { title: "Identity" }

/**
 * Organization identity — mutable legal identity, contact, registered seat, tax
 * registration, and the statutory signatories. Server-loads the org row +
 * signatories inside `withOrganization` (FORCE RLS), then renders the client
 * form. Writes gate on owner/admin in the server action.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const data = await loadOrgSettings(page.ctx, page.userId)
  return <IdentityForm slug={orgSlug} data={data} canEdit={page.canEdit} />
}
