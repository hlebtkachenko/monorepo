import { FamilyFilingsPage } from "../_components/family-page"

/**
 * Mzdové odvody a hlášení (spec §2.3): Vyúčtování daně, Přehled ČSSZ, Přehled
 * ZP, JMHZ.
 */
export default async function MzdoveOdvodyFamilyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <FamilyFilingsPage
      orgSlug={orgSlug}
      family="mzdove_odvody"
      titleKey="dane.navMzdoveOdvody"
    />
  )
}
