import { FamilyFilingsPage } from "../_components/family-page"

/** Ostatní (spec §2.3): silniční daň (data-driven) + a residual "ostatní" kind. */
export default async function OstatniFamilyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <FamilyFilingsPage
      orgSlug={orgSlug}
      family="ostatni"
      titleKey="dane.navOstatni"
    />
  )
}
