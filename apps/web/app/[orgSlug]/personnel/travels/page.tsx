import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Travels" }

export default async function TravelsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Travels"
      orgSlug={orgSlug}
      subpath="personnel/travels"
    />
  )
}
