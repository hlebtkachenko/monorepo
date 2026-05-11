import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Inbox" }

export default async function InboxPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Inbox" orgSlug={orgSlug} />
}
