import { FamilyFilingsPage } from "../_components/family-page"

/** Daň z příjmů (spec §2.3): DPPO přiznání + zálohy + účetní závěrka. */
export default async function DanZPrijmuFamilyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <FamilyFilingsPage
      orgSlug={orgSlug}
      family="dan_z_prijmu"
      titleKey="dane.navDanZPrijmu"
    />
  )
}
