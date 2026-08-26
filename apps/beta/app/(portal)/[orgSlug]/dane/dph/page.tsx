import { FamilyFilingsPage } from "../_components/family-page"

/**
 * DPH (spec §2.3): "visible when `vat_regime='platce'` OR any DPH filing
 * exists". The 404 for the excluded case lives in `FamilyFilingsPage`, not
 * here — this route is nothing but the family and the title.
 */
export default async function DphFamilyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <FamilyFilingsPage orgSlug={orgSlug} family="dph" titleKey="dane.navDph" />
  )
}
