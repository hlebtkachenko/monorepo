import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Organization settings" }

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Settings"
      orgSlug={orgSlug}
      description="Organization-level settings (members, regime, fiscal year, integrations). Stub for now."
    />
  )
}
