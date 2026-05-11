import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Posting" }

export default async function PostingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Posting"
      orgSlug={orgSlug}
      subpath="accounting/posting"
    />
  )
}
