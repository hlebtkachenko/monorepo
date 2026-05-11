import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Directory" }

export default async function DirectoryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Directory" orgSlug={orgSlug} />
}
