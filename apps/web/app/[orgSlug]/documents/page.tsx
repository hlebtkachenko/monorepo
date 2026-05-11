import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Documents" }

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Documents" orgSlug={orgSlug} />
}
