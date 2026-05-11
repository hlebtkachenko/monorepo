import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Assets" }

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Assets" orgSlug={orgSlug} />
}
