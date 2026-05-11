import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Journal" }

export default async function JournalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Journal"
      orgSlug={orgSlug}
      subpath="accounting/journal"
    />
  )
}
