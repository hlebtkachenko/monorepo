import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Credits" }

export default async function CreditsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub title="Credits" orgSlug={orgSlug} subpath="finance/credits" />
  )
}
