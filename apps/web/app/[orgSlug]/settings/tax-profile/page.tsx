import { notFound } from "next/navigation"

import { TaxProfileView } from "../_components/tax-profile-view"
import { getSettingsPageContext, loadTaxProfile } from "../_lib/settings-data"

export const metadata = { title: "Tax profile" }

/**
 * Tax profile — the organization_tax_profile history: currently just
 * effective payroll relationship and remittance facts the statutory engine needs
 * to know whether payroll obligations exist for a period. Reads inside
 * `withOrganization` (FORCE RLS); each change is a gated (owner/admin) server
 * action. Changing the profile closes the open row and inserts the new one
 * via the accounting `createTaxProfile` helper.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const page = await getSettingsPageContext(orgSlug)
  if (!page) notFound()

  const data = await loadTaxProfile(page.ctx, page.userId)
  return <TaxProfileView slug={orgSlug} data={data} canEdit={page.canEdit} />
}
